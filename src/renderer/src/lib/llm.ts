import type { LlmEvent, LlmRequest } from '../../../shared/types'
import { uid } from './util'

const handlers = new Map<string, (ev: LlmEvent) => void>()
let subscribed = false

/** Some local models still emit <think> blocks; hide them from the user. */
const clean = (s: string): string => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '')

export interface Stream {
  promise: Promise<string>
  abort: () => void
}

export function stream(req: LlmRequest, onText: (text: string) => void): Stream {
  if (!subscribed) {
    window.cereal.llm.onEvent((ev) => handlers.get(ev.id)?.(ev))
    subscribed = true
  }
  const id = uid()
  let raw = ''
  const promise = new Promise<string>((resolve, reject) => {
    handlers.set(id, (ev) => {
      if (ev.type === 'delta') {
        raw += ev.delta
        onText(clean(raw))
        return
      }
      handlers.delete(id)
      if (ev.type === 'error') reject(new Error(ev.error))
      else resolve(clean(raw))
    })
  })
  void window.cereal.llm.chat(id, req)
  return { promise, abort: () => void window.cereal.llm.abort(id) }
}

export const complete = (req: LlmRequest): Promise<string> => stream(req, () => {}).promise
