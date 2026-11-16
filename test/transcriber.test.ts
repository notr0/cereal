import { describe, expect, it } from 'vitest'
import { fakeCereal } from './setup'

fakeCereal()
const { cleanTranscript } = await import('../src/renderer/src/lib/transcriber')

describe('cleanTranscript', () => {
  it('drops Whisper filler on short clips but keeps it on long ones', () => {
    expect(cleanTranscript(' Thank you. ', 2)).toBe('')
    expect(cleanTranscript('Thank you.', 6)).toBe('Thank you.')
  })
  it('drops bracketed sound tags and punctuation-only output', () => {
    expect(cleanTranscript('[MUSIC]', 10)).toBe('')
    expect(cleanTranscript('(applause)', 10)).toBe('')
    expect(cleanTranscript('...', 10)).toBe('')
  })
  it('tidies whitespace', () => {
    expect(cleanTranscript('  We  ship\nFriday ', 3)).toBe('We ship Friday')
  })
})
