import { useSyncExternalStore } from 'react'
import type { Chat, Folder, LlmStatus, Note, Settings } from '../../../shared/types'
import { debounce, uid } from './util'

export type Route =
  | { name: 'home' }
  | { name: 'note'; id: string }
  | { name: 'chats' }
  | { name: 'chat'; id: string }
  | { name: 'folder'; id: string | null }

export interface State {
  ready: boolean
  notes: Note[]
  folders: Folder[]
  chats: Chat[]
  settings: Settings
  route: Route
  sidebarOpen: boolean
  searchOpen: boolean
  settingsOpen: boolean
  dark: boolean
  llm: LlmStatus | null
  model: string
}

let state: State = {
  ready: false,
  notes: [],
  folders: [],
  chats: [],
  settings: null as unknown as Settings,
  route: { name: 'home' },
  sidebarOpen: true,
  searchOpen: false,
  settingsOpen: false,
  dark: false,
  llm: null,
  model: ''
}

const listeners = new Set<() => void>()
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getState = (): State => state

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  listeners.forEach((l) => l())
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

// ── theme ──

const media = window.matchMedia('(prefers-color-scheme: dark)')
function applyTheme(): void {
  const t = state.settings?.theme ?? 'system'
  const dark = t === 'dark' || (t === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
  window.cereal.window.setTheme(dark)
  if (dark !== state.dark) setState({ dark })
}
media.addEventListener('change', applyTheme)

// ── init ──

export async function init(): Promise<void> {
  const [settings, notes, folders, chats] = await Promise.all([
    window.cereal.settings.get(),
    window.cereal.notes.list(),
    window.cereal.folders.get(),
    window.cereal.chats.list()
  ])
  setState({ settings, notes, folders, chats, ready: true })
  applyTheme()
  void refreshLlm()
}

export async function refreshLlm(): Promise<void> {
  const [llm, model] = await Promise.all([window.cereal.llm.status(), window.cereal.llm.model()])
  setState({ llm, model })
}

export function navigate(route: Route): void {
  setState({ route, searchOpen: false })
}

// ── settings ──

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const settings = { ...state.settings, ...patch }
  setState({ settings })
  await window.cereal.settings.save(settings)
  if ('theme' in patch) applyTheme()
  if (['llmProvider', 'claudeModel', 'llmBaseUrl', 'llmModel', 'odysseusDir'].some((k) => k in patch)) void refreshLlm()
}

/** Token budget for prompts: Ollama's configured window, or a generous slice of Claude's 1M. */
export const contextTokens = (s: Settings): number => (s.llmProvider === 'claude' ? 200_000 : s.numCtx)

// ── notes ──

const savers = new Map<string, ReturnType<typeof debounce<[Note]>>>()
function scheduleSave(note: Note): void {
  let s = savers.get(note.id)
  if (!s) {
    s = debounce((n: Note) => void window.cereal.notes.save(n), 400)
    savers.set(note.id, s)
  }
  s(note)
}
window.addEventListener('beforeunload', () => savers.forEach((s) => s.flush()))

export function createNote(folderId: string | null = null): Note {
  const now = Date.now()
  const note: Note = {
    id: uid(),
    title: '',
    createdAt: now,
    updatedAt: now,
    myNotes: '',
    enhanced: null,
    templateId: 'general',
    view: 'mine',
    folderId,
    transcript: [],
    recordedMs: 0,
    chat: []
  }
  setState((s) => ({ notes: [note, ...s.notes] }))
  void window.cereal.notes.save(note)
  navigate({ name: 'note', id: note.id })
  return note
}

export function updateNote(id: string, patch: Partial<Note> | ((n: Note) => Partial<Note>)): void {
  let updated: Note | null = null
  setState((s) => ({
    notes: s.notes.map((n) => {
      if (n.id !== id) return n
      updated = { ...n, ...(typeof patch === 'function' ? patch(n) : patch), updatedAt: Date.now() }
      return updated
    })
  }))
  if (updated) scheduleSave(updated)
}

export function deleteNote(id: string): void {
  // Drop any pending save: flushing it here would race the delete and bring the note back.
  savers.get(id)?.cancel()
  savers.delete(id)
  setState((s) => ({
    notes: s.notes.filter((n) => n.id !== id),
    route: s.route.name === 'note' && s.route.id === id ? { name: 'home' } : s.route
  }))
  void window.cereal.notes.remove(id)
}

export const getNote = (id: string): Note | undefined => state.notes.find((n) => n.id === id)

// ── folders ──

function saveFolders(folders: Folder[]): void {
  setState({ folders })
  void window.cereal.folders.save(folders)
}

export function createFolder(name: string): Folder {
  const f: Folder = { id: uid(), name: name.trim() || 'Untitled space', createdAt: Date.now() }
  saveFolders([...state.folders, f])
  return f
}

export function renameFolder(id: string, name: string): void {
  saveFolders(state.folders.map((f) => (f.id === id ? { ...f, name } : f)))
}

export function deleteFolder(id: string): void {
  saveFolders(state.folders.filter((f) => f.id !== id))
  state.notes.filter((n) => n.folderId === id).forEach((n) => updateNote(n.id, { folderId: null }))
  if (state.route.name === 'folder' && state.route.id === id) navigate({ name: 'home' })
}

// ── chats ──

export function saveChat(chat: Chat): void {
  setState((s) => ({
    chats: s.chats.some((c) => c.id === chat.id) ? s.chats.map((c) => (c.id === chat.id ? chat : c)) : [chat, ...s.chats]
  }))
  void window.cereal.chats.save(chat)
}

export function deleteChat(id: string): void {
  setState((s) => ({
    chats: s.chats.filter((c) => c.id !== id),
    route: s.route.name === 'chat' && s.route.id === id ? { name: 'chats' } : s.route
  }))
  void window.cereal.chats.remove(id)
}
