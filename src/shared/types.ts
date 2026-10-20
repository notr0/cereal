export type Speaker = 'me' | 'them'

export interface TranscriptEntry {
  id: string
  speaker: Speaker
  text: string
  at: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  at: number
}

export interface Note {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** TipTap HTML of what the user typed. */
  myNotes: string
  /** TipTap HTML of the AI-enhanced notes, or null before generation. */
  enhanced: string | null
  templateId: string
  view: 'mine' | 'enhanced'
  folderId: string | null
  transcript: TranscriptEntry[]
  recordedMs: number
  chat: ChatMessage[]
}

export interface Folder {
  id: string
  name: string
  createdAt: number
}

export interface Chat {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export type SttProvider = 'builtin' | 'odysseus' | 'openai'
export type LlmProvider = 'ollama' | 'claude'

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  userName: string
  llmProvider: LlmProvider
  claudeModel: string
  llmBaseUrl: string
  llmModel: string
  numCtx: number
  sttProvider: SttProvider
  whisperModel: string
  whisperLanguage: string
  odysseusDir: string
  odysseusUrl: string
  odysseusToken: string
  openaiSttUrl: string
  openaiSttModel: string
  micDeviceId: string
  captureSystemAudio: boolean
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  messages: LlmMessage[]
  /** Ollama only; current Claude models reject sampling parameters. */
  temperature?: number
  /** Sets Claude's effort: notes get more care than chat replies and titles. */
  purpose?: 'notes' | 'chat' | 'title'
}

export interface ClaudeKeyInfo {
  saved: boolean
  hint: string | null
  fromEnv: boolean
}

export type LlmEvent =
  | { id: string; type: 'delta'; delta: string }
  | { id: string; type: 'done' }
  | { id: string; type: 'error'; error: string }
  | { id: string; type: 'aborted' }

export interface LlmStatus {
  provider: LlmProvider
  ok: boolean
  version?: string
  models: string[]
  error?: string
}
