// Copies onnxruntime-web's WASM runtime next to the renderer so local Whisper works offline (no CDN).
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const dest = join(root, 'src', 'renderer', 'public', 'ort')
mkdirSync(dest, { recursive: true })
for (const f of readdirSync(src)) {
  if (/^ort-wasm-simd-threaded\.(jsep|asyncify)?\.?(mjs|wasm)$/.test(f)) cpSync(join(src, f), join(dest, f))
}
console.log(`ort runtime copied to ${dest}`)
