import { beforeEach, describe, expect, it } from 'vitest'
import type { Chat, Settings } from '../src/shared/types'
import { fakeCereal } from './setup'

const fake = fakeCereal()
const state = await import('../src/renderer/src/lib/state')
const chat = await import('../src/renderer/src/lib/globalChat')

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function seed(id: string): Chat {
  const c: Chat = { id, title: 'q', createdAt: 0, updatedAt: 0, messages: [{ role: 'user', content: 'what did I promise?', at: 1 }] }
  state.setState({ chats: [c], notes: [], settings: { userName: 'Me', llmProvider: 'ollama', numCtx: 16384 } as Settings })
  return c
}

describe('global chat answers', () => {
  beforeEach(() => {
    fake.calls.length = 0
    fake.saves.length = 0
  })

  it('answers once even if the chat is left and reopened mid-answer', async () => {
    seed('c1')
    chat.answerIfNeeded('c1') // first visit
    chat.answerIfNeeded('c1') // came back while the answer was still streaming
    expect(fake.calls).toHaveLength(1)

    const { id } = fake.calls[0]
    fake.emit({ id, type: 'delta', delta: 'You promised ' })
    fake.emit({ id, type: 'delta', delta: 'the report.' })
    fake.emit({ id, type: 'done' })
    await tick()

    const saved = state.getState().chats.find((c) => c.id === 'c1')
    expect(saved?.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(saved?.messages[1].content).toBe('You promised the report.')

    // Reopening an answered chat starts nothing.
    chat.answerIfNeeded('c1')
    expect(fake.calls).toHaveLength(1)
  })

  it("doesn't retry a failed question on its own, but Try again does", async () => {
    seed('c2')
    chat.answerIfNeeded('c2')
    fake.emit({ id: fake.calls[0].id, type: 'error', error: 'Ollama is not running' })
    await tick()
    chat.answerIfNeeded('c2')
    expect(fake.calls).toHaveLength(1)
    chat.retry('c2')
    expect(fake.calls).toHaveLength(2)
  })

  it('stops writing into a chat that was deleted', async () => {
    seed('c3')
    chat.answerIfNeeded('c3')
    chat.removeChat('c3')
    await tick()
    expect(state.getState().chats.find((c) => c.id === 'c3')).toBeUndefined()
    expect(fake.saves.some((c) => (c as Chat).id === 'c3' && (c as Chat).messages.length > 1)).toBe(false)
  })
})
