import { useSyncExternalStore } from 'react'
import { stream, type Stream } from './llm'
import { globalChatMessages } from './prompts'
import { contextTokens, deleteChat, getState, saveChat } from './state'

/**
 * Answers for the global chats live here rather than in ChatView, so leaving a chat mid-answer
 * and coming back finds the answer still streaming instead of starting a second one.
 */
export interface ChatRun {
  /** The partial answer while streaming, or null when idle. */
  answer: string | null
  error: string | null
}

const IDLE: ChatRun = { answer: null, error: null }

const runs = new Map<string, ChatRun>()
const streams = new Map<string, Stream>()
/** The question each chat last failed on, so reopening the chat doesn't silently retry it in a loop. */
const failedAt = new Map<string, number>()
const listeners = new Set<() => void>()

const set = (id: string, run: ChatRun): void => {
  runs.set(id, run)
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useChatRun = (id: string): ChatRun => useSyncExternalStore(subscribe, () => runs.get(id) ?? IDLE)

/** Starts answering if the chat ends with a question that isn't answered or being answered yet. */
export function answerIfNeeded(id: string): void {
  if (streams.has(id)) return
  const chat = getState().chats.find((c) => c.id === id)
  const last = chat?.messages[chat.messages.length - 1]
  if (!chat || !last || last.role !== 'user') return
  if (failedAt.get(id) === last.at) return
  const { notes, settings } = getState()
  set(id, { answer: '', error: null })
  const s = stream(
    {
      messages: globalChatMessages(notes, chat.messages.slice(0, -1), last.content, settings.userName, contextTokens(settings)),
      purpose: 'chat'
    },
    (answer) => set(id, { answer, error: null })
  )
  streams.set(id, s)
  s.promise
    .then((reply) => {
      failedAt.delete(id)
      const fresh = getState().chats.find((c) => c.id === id)
      if (fresh && reply.trim()) {
        saveChat({ ...fresh, updatedAt: Date.now(), messages: [...fresh.messages, { role: 'assistant', content: reply, at: Date.now() }] })
      }
      set(id, IDLE)
    })
    .catch((e) => {
      failedAt.set(id, last.at)
      set(id, { answer: null, error: e instanceof Error ? e.message : String(e) })
    })
    .finally(() => streams.delete(id))
}

/** Asks a follow-up in an existing chat; a new question clears the last error. */
export function askFollowUp(id: string, question: string): void {
  const chat = getState().chats.find((c) => c.id === id)
  if (!chat || streams.has(id)) return
  saveChat({ ...chat, updatedAt: Date.now(), messages: [...chat.messages, { role: 'user', content: question, at: Date.now() }] })
  answerIfNeeded(id)
}

/** Lets a failed question be asked again. */
export function retry(id: string): void {
  failedAt.delete(id)
  set(id, IDLE)
  answerIfNeeded(id)
}

export function stopAnswer(id: string): void {
  streams.get(id)?.abort()
}

/** Deletes a chat and stops any answer still being written for it. */
export function removeChat(id: string): void {
  stopAnswer(id)
  runs.delete(id)
  failedAt.delete(id)
  deleteChat(id)
}
