import { env, pipeline } from '@huggingface/transformers'

type Asr = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>

env.allowLocalModels = false

/** The model that's loaded or loading. Kept as one pair so a model switch mid-load can't mix them up. */
let current: { model: string; asr: Promise<Asr> } | null = null

const post = (msg: unknown): void => (self as unknown as Worker).postMessage(msg)

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
  if (!gpu) return false
  try {
    return !!(await gpu.requestAdapter())
  } catch {
    return false
  }
}

async function create(model: string, device: 'webgpu' | 'wasm'): Promise<Asr> {
  const totals = new Map<string, { loaded: number; total: number }>()
  let lastPct = -1
  const dtype =
    device === 'webgpu'
      ? { encoder_model: model.includes('large') ? 'fp16' : 'fp32', decoder_model_merged: 'q4' }
      : 'q8'
  return (await pipeline('automatic-speech-recognition', model, {
    device,
    dtype: dtype as never,
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file && p.total) {
        totals.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
        let loaded = 0
        let total = 0
        totals.forEach((v) => {
          loaded += v.loaded
          total += v.total
        })
        const pct = Math.floor((loaded / total) * 100)
        if (pct !== lastPct) {
          lastPct = pct
          post({ type: 'status', status: `Downloading speech model… ${pct}%` })
        }
      }
    }
  })) as unknown as Asr
}

function load(model: string, wasmBase: string): Promise<Asr> {
  if (current?.model === model) return current.asr
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: string } }
  if (onnx.wasm) onnx.wasm.wasmPaths = wasmBase
  post({ type: 'status', status: 'Loading speech model…' })
  const asr = (async () => {
    if (await hasWebGpu()) {
      try {
        return await create(model, 'webgpu')
      } catch (e) {
        console.warn('WebGPU Whisper failed, falling back to CPU', e)
      }
    }
    return create(model, 'wasm')
  })()
  const entry = { model, asr }
  current = entry
  asr.then(
    () => {
      if (current === entry) post({ type: 'status', status: null })
    },
    () => {
      // Forget a failed load so the next utterance tries again instead of reusing the failure.
      if (current === entry) {
        current = null
        post({ type: 'status', status: null })
      }
    }
  )
  return asr
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      await load(m.model, m.wasmBase)
      return
    }
    if (m.type === 'transcribe') {
      const run = await load(m.model, m.wasmBase)
      const opts: Record<string, unknown> = {}
      if (!m.model.endsWith('.en')) {
        opts.task = 'transcribe'
        if (m.language) opts.language = m.language
      }
      const out = await run(m.audio, opts)
      const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
      post({ type: 'result', id: m.id, text })
    }
  } catch (err) {
    post({ type: 'error', id: m.id, error: err instanceof Error ? err.message : String(err) })
  }
}
