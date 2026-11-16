import { describe, expect, it } from 'vitest'
import { joinAudio, takeBatch, type Segment } from '../src/renderer/src/lib/batch'

const seg = (key: string, len: number, fill = 1): Segment => ({ key, audio: new Float32Array(len).fill(fill) })

describe('takeBatch', () => {
  it('returns nothing for an empty queue', () => {
    expect(takeBatch([], 100, 0)).toEqual([])
  })

  it('merges neighbours from the same speaker', () => {
    const q = [seg('me', 10), seg('me', 10), seg('them', 10), seg('me', 10)]
    const batch = takeBatch(q, 100, 2)
    expect(batch.map((s) => s.key)).toEqual(['me', 'me'])
    expect(q.map((s) => s.key)).toEqual(['them', 'me'])
  })

  it('never reaches past another speaker, so order is kept', () => {
    const q = [seg('them', 10), seg('me', 10), seg('them', 10)]
    expect(takeBatch(q, 100, 0)).toHaveLength(1)
    expect(q).toHaveLength(2)
  })

  it('stops before the joined audio would pass the limit, gaps included', () => {
    const q = [seg('me', 40), seg('me', 40), seg('me', 40)]
    // 40 + 5 + 40 = 85 fits; adding another 45 would make 130.
    expect(takeBatch(q, 100, 5)).toHaveLength(2)
    expect(q).toHaveLength(1)
  })

  it('always takes the first segment even if it is over the limit', () => {
    const q = [seg('me', 500), seg('me', 1)]
    expect(takeBatch(q, 100, 0)).toHaveLength(1)
  })
})

describe('joinAudio', () => {
  it('returns a single clip untouched', () => {
    const a = new Float32Array([1, 2])
    expect(joinAudio([a], 3)).toBe(a)
  })

  it('puts silence between clips', () => {
    const out = joinAudio([new Float32Array([1, 1]), new Float32Array([2])], 2)
    expect(Array.from(out)).toEqual([1, 1, 0, 0, 2])
  })
})
