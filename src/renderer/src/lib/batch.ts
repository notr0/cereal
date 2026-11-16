/** Pure helpers for batching queued speech segments. Kept free of app state so they can be unit tested. */

export interface Segment {
  audio: Float32Array
  /** Segments only merge with neighbours that share a key (the speaker). */
  key: string
}

/**
 * Takes the next batch off the front of the queue: the first segment plus the ones right behind it
 * from the same speaker, while the joined audio stays within maxSamples. Only neighbours merge, so
 * the transcript never changes order.
 */
export function takeBatch<T extends Segment>(queue: T[], maxSamples: number, gapSamples: number): T[] {
  const first = queue.shift()
  if (!first) return []
  const batch = [first]
  let total = first.audio.length
  while (queue.length && queue[0].key === first.key && total + gapSamples + queue[0].audio.length <= maxSamples) {
    const next = queue.shift() as T
    total += gapSamples + next.audio.length
    batch.push(next)
  }
  return batch
}

/** Joins audio clips with a short silence between them so words at the edges don't run together. */
export function joinAudio(parts: Float32Array[], gapSamples: number): Float32Array {
  if (parts.length === 1) return parts[0]
  const total = parts.reduce((n, p) => n + p.length, 0) + gapSamples * (parts.length - 1)
  const out = new Float32Array(total)
  let at = 0
  parts.forEach((p, i) => {
    if (i > 0) at += gapSamples
    out.set(p, at)
    at += p.length
  })
  return out
}
