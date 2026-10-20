import { contextBridge, ipcRenderer } from 'electron'
import type { Chat, ClaudeKeyInfo, Folder, LlmEvent, LlmRequest, LlmStatus, Note, Settings } from '../shared/types'

const api = {
  platform: process.platform,
  notes: {
    list: (): Promise<Note[]> => ipcRenderer.invoke('store:listNotes'),
    save: (n: Note): Promise<void> => ipcRenderer.invoke('store:saveNote', n),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('store:deleteNote', id)
  },
  chats: {
    list: (): Promise<Chat[]> => ipcRenderer.invoke('store:listChats'),
    save: (c: Chat): Promise<void> => ipcRenderer.invoke('store:saveChat', c),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('store:deleteChat', id)
  },
  folders: {
    get: (): Promise<Folder[]> => ipcRenderer.invoke('store:getFolders'),
    save: (f: Folder[]): Promise<void> => ipcRenderer.invoke('store:saveFolders', f)
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    save: (s: Settings): Promise<void> => ipcRenderer.invoke('settings:save', s)
  },
  llm: {
    chat: (id: string, req: LlmRequest): Promise<void> => ipcRenderer.invoke('llm:chat', id, req),
    abort: (id: string): Promise<void> => ipcRenderer.invoke('llm:abort', id),
    status: (): Promise<LlmStatus> => ipcRenderer.invoke('llm:status'),
    model: (): Promise<string> => ipcRenderer.invoke('llm:model'),
    onEvent(cb: (ev: LlmEvent) => void): () => void {
      const handler = (_e: unknown, ev: LlmEvent): void => cb(ev)
      ipcRenderer.on('llm:event', handler)
      return () => ipcRenderer.removeListener('llm:event', handler)
    }
  },
  stt: {
    transcribe: (wav: ArrayBuffer): Promise<string> => ipcRenderer.invoke('stt:transcribe', wav)
  },
  secrets: {
    setClaudeKey: (key: string | null): Promise<void> => ipcRenderer.invoke('secrets:setClaudeKey', key),
    claudeKeyInfo: (): Promise<ClaudeKeyInfo> => ipcRenderer.invoke('secrets:claudeKeyInfo')
  },
  window: {
    setTheme: (dark: boolean): void => ipcRenderer.send('window:theme', dark)
  },
  openExternal: (url: string): void => ipcRenderer.send('app:openExternal', url)
}

contextBridge.exposeInMainWorld('cereal', api)

export type CerealApi = typeof api
