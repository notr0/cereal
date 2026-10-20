import type { Speaker } from '../../../shared/types'

const FRAME = 1600 // 100 ms at 16 kHz

/** Energy-based voice activity segmentation: cuts audio into utterances at pauses. */
class Segmenter {
  private noise = 0.004
  private preroll: Float32Array[] = []
  private frames: Float32Array[] = []
  private speechFrames = 0
  private silence = 0

  constructor(private emit: (audio: Float32Array) => void) {}

  /** Returns a 0–1 loudness for the level meter. */
  push(frame: Float32Array): number {
    let sum = 0
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
    const rms = Math.sqrt(sum / frame.length)
    const speech = rms > Math.max(0.01, this.noise * 2.5)
    this.noise = rms < this.noise ? this.noise * 0.9 + rms * 0.1 : this.noise * 0.998 + rms * 0.002

    if (this.frames.length === 0) {
      if (speech) {
        this.frames = [...this.preroll, frame]
        this.speechFrames = 1
        this.silence = 0
      } else {
        this.preroll.push(frame)
        if (this.preroll.length > 3) this.preroll.shift()
      }
    } else {
      this.frames.push(frame)
      if (speech) {
        this.speechFrames++
        this.silence = 0
      } else this.silence++
      const len = this.frames.length
      if ((this.silence >= 7 && len >= 15) || len >= 200) this.flush()
    }
    return Math.min(1, Math.sqrt(rms) * 2.6)
  }

  flush(): void {
    const frames = this.frames
    const enough = this.speechFrames >= 5
    this.frames = []
    this.preroll = []
    this.speechFrames = 0
    this.silence = 0
    if (!enough) return
    const out = new Float32Array(frames.length * FRAME)
    frames.forEach((f, i) => out.set(f, i * FRAME))
    this.emit(out)
  }
}

export class Recorder {
  private ctx: AudioContext | null = null
  private streams: MediaStream[] = []
  private segmenters: Segmenter[] = []
  level: Record<Speaker, number> = { me: 0, them: 0 }

  constructor(private onSegment: (speaker: Speaker, audio: Float32Array) => void) {}

  async start(opts: { micDeviceId: string; system: boolean }): Promise<{ system: boolean }> {
    const ctx = new AudioContext({ sampleRate: 16000 })
    this.ctx = ctx
    await ctx.audioWorklet.addModule(new URL('pcm-worklet.js', window.location.href).href)

    const mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: opts.micDeviceId ? { exact: opts.micDeviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    this.attach('me', mic)

    let system = false
    if (opts.system) {
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        const audio = display.getAudioTracks()
        // Only the loopback audio is needed; keep the video track alive but disabled so Windows keeps audio flowing.
        display.getVideoTracks().forEach((t) => (t.enabled = false))
        this.streams.push(display)
        if (audio.length) {
          this.attach('them', new MediaStream(audio))
          system = true
        }
      } catch (e) {
        console.warn('System audio capture unavailable', e)
      }
    }
    return { system }
  }

  private attach(speaker: Speaker, stream: MediaStream): void {
    const ctx = this.ctx as AudioContext
    this.streams.push(stream)
    const source = ctx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(ctx, 'pcm-capture')
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(node)
    node.connect(mute)
    mute.connect(ctx.destination)
    const seg = new Segmenter((audio) => this.onSegment(speaker, audio))
    this.segmenters.push(seg)
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      this.level[speaker] = seg.push(e.data)
    }
  }

  async pause(): Promise<void> {
    this.segmenters.forEach((s) => s.flush())
    await this.ctx?.suspend()
    this.level = { me: 0, them: 0 }
  }

  async resume(): Promise<void> {
    await this.ctx?.resume()
  }

  async stop(): Promise<void> {
    this.segmenters.forEach((s) => s.flush())
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    this.streams = []
    await this.ctx?.close()
    this.ctx = null
    this.level = { me: 0, them: 0 }
  }
}
