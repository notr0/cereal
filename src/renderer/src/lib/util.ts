export const uid = (): string =>
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)

const DAY = 86_400_000
const startOfDay = (t: number): number => new Date(t).setHours(0, 0, 0, 0)

export function dayLabel(t: number): string {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(t)) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const sameYear = new Date(t).getFullYear() === new Date().getFullYear()
  return new Date(t).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })
}

export function timeParts(t: number): { time: string; ampm: string } {
  const s = new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const [time, ampm = ''] = s.split(' ')
  return { time, ampm }
}

export function shortDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function duration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** Plain text from editor HTML, keeping one line per block so prompts stay readable. */
export function htmlToText(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const lines: string[] = []
  const walk = (el: Element, depth: number): void => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName
      if (tag === 'UL' || tag === 'OL') walk(child, depth + 1)
      else if (tag === 'LI') {
        const own = Array.from(child.childNodes)
          .filter((n) => !(n instanceof Element && /^(UL|OL)$/.test(n.tagName)))
          .map((n) => n.textContent)
          .join(' ')
          .trim()
        if (own) lines.push(`${'  '.repeat(Math.max(0, depth - 1))}- ${own}`)
        walk(child, depth)
      } else if (/^H[1-6]$/.test(tag)) lines.push(`${'#'.repeat(Number(tag[1]))} ${child.textContent?.trim()}`)
      else if (tag === 'P' || tag === 'BLOCKQUOTE' || tag === 'PRE') {
        const t = child.textContent?.trim()
        if (t) lines.push(t)
      } else walk(child, depth)
    }
  }
  walk(doc.body, 0)
  return lines.join('\n')
}

export function words(s: string): string[] {
  return s.toLowerCase().match(/[\p{L}\p{N}']{3,}/gu) ?? []
}

export function jaccard(a: string, b: string): number {
  const A = new Set(words(a))
  const B = new Set(words(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { flush: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null
  let last: A | null = null
  const run = (...a: A): void => {
    last = a
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = null
      fn(...(last as A))
    }, ms)
  }
  run.flush = (): void => {
    if (t) {
      clearTimeout(t)
      t = null
      fn(...(last as A))
    }
  }
  return run
}

export function encodeWav(samples: Float32Array, sampleRate = 16000): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}
