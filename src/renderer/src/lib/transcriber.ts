import { getState } from './state'
import { encodeWav } from './util'

interface Pending {
  resolve: (text: string) => void
  reject: (e: Error) => void
}

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
  private queue: Promise<unknown> = Promise.resolve()
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
    this.worker = w
    return w
  }

  /** Starts downloading/loading the local model so the first utterance isn't delayed. */
  warmup(): void {
    const s = getState().settings
    if (s.sttProvider !== 'builtin') return
    this.ensureWorker().postMessage({ type: 'load', model: s.whisperModel, wasmBase: this.wasmBase() })
  }

  /** Transcriptions run one at a time, in order. */
  transcribe(audio: Float32Array): Promise<string> {
    const job = (): Promise<string> => this.run(audio)
    const p = this.queue.then(job, job)
    this.queue = p.catch(() => undefined)
    return p
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
