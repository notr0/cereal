// Renders build/icon.svg (and icon-small.svg for tiny sizes) into build/icon.ico, build/icon.png
// and the tray icons in build/tray/. Run with `npm run icon` after editing the SVGs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const build = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const large = readFileSync(join(build, 'icon.svg'), 'utf8')
const small = readFileSync(join(build, 'icon-small.svg'), 'utf8')

// Recording badge for the tray: a red dot in the bottom-right corner.
const badge = (svg, cx, r, ring) =>
  svg.replace('</svg>', `<circle cx="${cx}" cy="${cx}" r="${r}" fill="#e95d3d" stroke="#292929" stroke-width="${ring}"/></svg>`)
const largeRecording = badge(large, 196, 46, 16)
const smallRecording = badge(small, 194, 54, 20)

const rasterize = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render()
const render = (svg, size) => rasterize(svg, size).asPng()

/** 32-bit BGRA DIB entry, which every part of Windows can read at small sizes. */
function bmpEntry(svg, size) {
  const rgba = rasterize(svg, size).pixels
  const maskRow = Math.ceil(size / 32) * 4
  const out = Buffer.alloc(40 + size * size * 4 + maskRow * size)
  out.writeUInt32LE(40, 0)
  out.writeInt32LE(size, 4)
  out.writeInt32LE(size * 2, 8) // color + AND mask
  out.writeUInt16LE(1, 12)
  out.writeUInt16LE(32, 14)
  out.writeUInt32LE(size * size * 4 + maskRow * size, 20)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = ((size - 1 - y) * size + x) * 4 // DIB rows are bottom-up
      const dst = 40 + (y * size + x) * 4
      out[dst] = rgba[src + 2]
      out[dst + 1] = rgba[src + 1]
      out[dst + 2] = rgba[src]
      out[dst + 3] = rgba[src + 3]
    }
  }
  return out // AND mask stays zero; transparency comes from alpha
}

/** ICO container: bitmap entries below 256 px, PNG for 256 px. */
function ico(sizes, largeSvg, smallSvg) {
  const images = sizes.map((size) => {
    const svg = size <= 24 ? smallSvg : largeSvg
    return { size, data: size >= 256 ? render(svg, size) : bmpEntry(svg, size) }
  })
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dir = Buffer.alloc(16 * images.length)
  let offset = 6 + dir.length
  images.forEach(({ size, data }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...images.map((x) => x.data)])
}

writeFileSync(join(build, 'icon.ico'), ico([16, 20, 24, 32, 40, 48, 64, 96, 128, 256], large, small))
writeFileSync(join(build, 'icon.png'), render(large, 512))

const traySizes = [16, 20, 24, 32, 40, 48]
mkdirSync(join(build, 'tray'), { recursive: true })
writeFileSync(join(build, 'tray', 'tray.ico'), ico(traySizes, large, small))
writeFileSync(join(build, 'tray', 'tray-recording.ico'), ico(traySizes, largeRecording, smallRecording))

console.log(`icon.ico, icon.png and tray/*.ico written to ${build}`)
