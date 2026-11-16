import { describe, expect, it } from 'vitest'
import type { Note } from '../src/shared/types'
import { budgetChars, globalChatMessages, noteChatMessages, transcriptText } from '../src/renderer/src/lib/prompts'

const note = (p: Partial<Note>): Note => ({
  id: 'n1',
  title: 'Sync',
  createdAt: 0,
  updatedAt: 0,
  myNotes: '<p>my point</p>',
  enhanced: null,
  templateId: 'general',
  view: 'mine',
  folderId: null,
  transcript: [],
  recordedMs: 0,
  chat: [],
  ...p
})

describe('transcriptText', () => {
  it('labels speakers with the user name', () => {
    const t = transcriptText(
      [
        { id: '1', speaker: 'me', text: 'hi', at: 0 },
        { id: '2', speaker: 'them', text: 'hello', at: 1 }
      ],
      'Roman',
      1000
    )
    expect(t).toBe('Roman: hi\nThem: hello')
  })

  it('keeps the start and end of a long transcript', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({ id: String(i), speaker: 'them' as const, text: `line ${i}`, at: i }))
    const t = transcriptText(entries, 'Me', 400)
    expect(t).toContain('line 0')
    expect(t).toContain('line 199')
    expect(t).toContain('middle of transcript omitted')
    expect(t.length).toBeLessThan(500)
  })
})

describe('budgetChars', () => {
  it('never goes below a floor', () => {
    expect(budgetChars(1000)).toBe(4000)
    expect(budgetChars(16384)).toBeGreaterThan(40_000)
  })
})

describe('chat prompts', () => {
  it('drops empty past messages, which Claude rejects', () => {
    const msgs = noteChatMessages(
      note({}),
      [
        { role: 'user', content: 'q1', at: 0 },
        { role: 'assistant', content: '  ', at: 1 }
      ],
      'q2',
      'Me',
      16384
    )
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'user'])
    expect(msgs[0].content).toContain('my point')
  })

  it('puts the newest notes first and says when there are none', () => {
    const msgs = globalChatMessages(
      [note({ id: 'a', title: 'Old', createdAt: 1 }), note({ id: 'b', title: 'New', createdAt: 2 })],
      [],
      'what?',
      'Me',
      16384
    )
    expect(msgs[0].content.indexOf('New')).toBeLessThan(msgs[0].content.indexOf('Old'))
    expect(globalChatMessages([], [], 'q', 'Me', 16384)[0].content).toContain('no notes yet')
  })
})
