import { vi } from 'vitest'
import type { LlmEvent, LlmRequest } from '../src/shared/types'

/** A stand-in for the preload bridge: records LLM calls and lets a test drive their events. */
export function fakeCereal(): {
  calls: { id: string; req: LlmRequest }[]
  emit: (ev: LlmEvent) => void
  saves: unknown[]
} {
  let listener: ((ev: LlmEvent) => void) | null = null
  const calls: { id: string; req: LlmRequest }[] = []
  const saves: unknown[] = []
  const cereal = {
    platform: 'win32',
    llm: {
      chat: vi.fn(async (id: string, req: LlmRequest) => {
        calls.push({ id, req })
      }),
      abort: vi.fn(async (id: string) => listener?.({ id, type: 'aborted' })),
      onEvent: (cb: (ev: LlmEvent) => void) => {
        listener = cb
        return () => (listener = null)
      }
    },
    chats: {
      save: vi.fn(async (c: unknown) => {
        saves.push(c)
      }),
      remove: vi.fn(async () => undefined)
    },
    notes: { save: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
    folders: { save: vi.fn(async () => undefined) },
    window: { setTheme: vi.fn() }
  }
  ;(window as unknown as { cereal: unknown }).cereal = cereal
  return { calls, emit: (ev) => listener?.(ev), saves }
}
