import { describe, expect, it, vi } from 'vitest'
import { debounce, duration, encodeWav, htmlToText, jaccard } from '../src/renderer/src/lib/util'

describe('duration', () => {
  it('formats minutes and hours', () => {
    expect(duration(0)).toBe('0:00')
    expect(duration(65_000)).toBe('1:05')
    expect(duration(3_725_000)).toBe('1:02:05')
  })
})

describe('jaccard', () => {
  it('scores word overlap and ignores short words', () => {
    expect(jaccard('the plan is good', 'the plan is good')).toBe(1)
    expect(jaccard('hello there', 'goodbye now')).toBe(0)
    expect(jaccard('', 'anything')).toBe(0)
  })
})

describe('htmlToText', () => {
  it('keeps one line per block and indents nested bullets', () => {
    const html = '<h3>Plan</h3><p>Intro</p><ul><li><p>One</p><ul><li><p>Sub</p></li></ul></li><li><p>Two</p></li></ul>'
    expect(htmlToText(html)).toBe('### Plan\nIntro\n- One\n  - Sub\n- Two')
  })
  it('handles empty input', () => {
    expect(htmlToText('')).toBe('')
  })
})

describe('debounce', () => {
  it('runs once with the last arguments, and flush runs it now', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d(1)
    d(2)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenLastCalledWith(2)
    d(3)
    d.flush()
    expect(fn).toHaveBeenLastCalledWith(3)
    d(4)
    d.cancel()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('encodeWav', () => {
  it('writes a 16-bit mono header and clamps samples', () => {
    const buf = encodeWav(new Float32Array([0, 2, -2]))
    const v = new DataView(buf)
    expect(buf.byteLength).toBe(44 + 6)
    expect(String.fromCharCode(...new Uint8Array(buf, 0, 4))).toBe('RIFF')
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getInt16(46, true)).toBe(0x7fff)
    expect(v.getInt16(48, true)).toBe(-0x8000)
  })
})

describe('htmlToText with ordered lists and plain items', () => {
  it('handles items without a <p> wrapper and ordered lists', () => {
    expect(htmlToText('<ol><li>First<ol><li>Inner</li></ol></li><li>Second</li></ol>')).toBe('- First\n  - Inner\n- Second')
  })
})
