import { env, pipeline } from '@huggingface/transformers'

type Asr = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>

env.allowLocalModels = false

let asr: Asr | null = null
let loadedKey = ''
let loading: Promise<Asr> | null = null

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

async function load(model: string, wasmBase: string): Promise<Asr> {
  if (asr && loadedKey === model) return asr
  if (loading && loadedKey === model) return loading
  loadedKey = model
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: string } }
  if (onnx.wasm) onnx.wasm.wasmPaths = wasmBase
  post({ type: 'status', status: 'Loading speech model…' })
  loading = (async () => {
    if (await hasWebGpu()) {
      try {
        return await create(model, 'webgpu')
      } catch (e) {
        console.warn('WebGPU Whisper failed, falling back to CPU', e)
      }
    }
    return create(model, 'wasm')
  })()
  try {
    asr = await loading
    return asr
  } finally {
    loading = null
    post({ type: 'status', status: null })
  }
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
