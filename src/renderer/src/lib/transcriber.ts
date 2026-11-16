import { joinAudio, takeBatch } from './batch'
import { getState } from './state'
import { encodeWav } from './util'

interface Pending {
  resolve: (text: string) => void
  reject: (e: Error) => void
}

interface Job extends Pending {
  audio: Float32Array
  key: string
}

const SAMPLE_RATE = 16000
/** Whisper hears 30 s at a time; stay under that so a batch is never cut. */
const MAX_BATCH_SAMPLES = 28 * SAMPLE_RATE
const GAP_SAMPLES = 0.2 * SAMPLE_RATE

const JUNK = new Set([
  'you',
  'so',
  'bye',
  'okay',
  'thank you',
  'thanks',
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
  'subtitles by the amara.org community'
])

/** Whisper invents filler on near-silent audio; drop those outputs. */
export function cleanTranscript(text: string, seconds: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t || /^[[(].*[\])]$/.test(t) || !/[\p{L}\p{N}]/u.test(t)) return ''
  const bare = t.toLowerCase().replace(/[.!?,…]+/g, '').trim()
  if (seconds < 4 && JUNK.has(bare)) return ''
  return t
}

class Transcriber {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private nextId = 0
  private jobs: Job[] = []
  private busy = false
  onStatus: (status: string | null) => void = () => {}

  private wasmBase(): string {
    return new URL('ort/', window.location.href).href
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const w = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'status') this.onStatus(m.status)
      else if (m.type === 'result') {
        this.pending.get(m.id)?.resolve(m.text)
        this.pending.delete(m.id)
      } else if (m.type === 'error') {
        this.pending.get(m.id)?.reject(new Error(m.error))
        this.pending.delete(m.id)
        if (m.id === undefined) this.onStatus(`Speech model error: ${m.error}`)
      }
    }
    // A crashed worker never answers; fail what's waiting and start a fresh one next time.
    w.onerror = (e) => {
      e.preventDefault()
      const err = new Error(e.message || 'The speech model stopped unexpectedly.')
      this.pending.forEach((p) => p.reject(err))
      this.pending.clear()
      w.terminate()
      if (this.worker === w) this.worker = null
    }
    this.worker = w
    return w
  }

  /** Starts downloading/loading the local model so the first utterance isn't delayed. */
  warmup(): void {
    const s = getState().settings
    if (s.sttProvider !== 'builtin') return
    this.ensureWorker().postMessage({ type: 'load', model: s.whisperModel, wasmBase: this.wasmBase() })
  }

  /**
   * Transcriptions run one at a time, in order. When the engine falls behind (Whisper on CPU),
   * the segments waiting from the same speaker go through as one call. Whisper pads every call
   * to 30 s of audio, so a few short segments cost about the same as one, and the backlog drains.
   * The first segment of a batch gets the text; the others resolve empty.
   */
  transcribe(audio: Float32Array, key = ''): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.jobs.push({ audio, key, resolve, reject })
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      while (this.jobs.length) {
        const batch = takeBatch(this.jobs, MAX_BATCH_SAMPLES, GAP_SAMPLES)
        try {
          const text = await this.run(joinAudio(batch.map((j) => j.audio), GAP_SAMPLES))
          batch.forEach((j, i) => j.resolve(i === 0 ? text : ''))
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e))
          batch.forEach((j) => j.reject(err))
        }
      }
    } finally {
      this.busy = false
    }
  }

  private run(audio: Float32Array): Promise<string> {
    const s = getState().settings
    if (s.sttProvider !== 'builtin') return window.cereal.stt.transcribe(encodeWav(audio))
    const id = ++this.nextId
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ensureWorker().postMessage(
        { type: 'transcribe', id, audio, model: s.whisperModel, language: s.whisperLanguage, wasmBase: this.wasmBase() },
        [audio.buffer]
      )
    })
  }
}

export const transcriber = new Transcriber()
