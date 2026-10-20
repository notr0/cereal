import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_CLAUDE_MODEL } from '../shared/models'
import type { Chat, Folder, Note, Settings } from '../shared/types'

const root = (): string => join(app.getPath('userData'), 'data')
const ID = /^[a-z0-9-]{1,64}$/i

function fileFor(kind: 'notes' | 'chats', id: string): string {
  if (!ID.test(id)) throw new Error(`Invalid id: ${id}`)
  return join(root(), kind, `${id}.json`)
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

// Writes and deletes of one file run in order, so two saves can't share the .tmp file
// and a delete can't land before a save that was sent ahead of it.
const queues = new Map<string, Promise<unknown>>()
function serial<T>(file: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(file) ?? Promise.resolve()).then(job, job)
  const tail = run.catch(() => undefined)
  queues.set(file, tail)
  void tail.then(() => {
    if (queues.get(file) === tail) queues.delete(file)
  })
  return run
}

const writeJson = (file: string, data: unknown): Promise<void> => serial(file, () => writeNow(file, data))
const removeFile = (file: string): Promise<void> => serial(file, () => fs.rm(file, { force: true }))

async function writeNow(file: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2))
  try {
    await fs.rename(tmp, file)
  } catch {
    // Windows can refuse the rename while another process holds the file; fall back to a direct write.
    await fs.writeFile(file, JSON.stringify(data, null, 2))
    await fs.rm(tmp, { force: true })
  }
}

async function listDir<T>(kind: 'notes' | 'chats'): Promise<T[]> {
  const dir = join(root(), kind)
  await fs.mkdir(dir, { recursive: true })
  const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'))
  const items = await Promise.all(names.map((n) => readJson<T | null>(join(dir, n), null)))
  return items.filter((x): x is Awaited<T> => x !== null) as T[]
}

export function defaultSettings(): Settings {
  return {
    theme: 'system',
    userName: 'Me',
    llmProvider: 'ollama',
    claudeModel: DEFAULT_CLAUDE_MODEL,
    llmBaseUrl: 'http://127.0.0.1:11434',
    llmModel: '',
    numCtx: 16384,
    sttProvider: 'builtin',
    whisperModel: 'onnx-community/whisper-small',
    whisperLanguage: 'en',
    odysseusDir: 'H:\\odysseus',
    odysseusUrl: 'http://127.0.0.1:7000',
    odysseusToken: '',
    openaiSttUrl: 'http://127.0.0.1:8000/v1',
    openaiSttModel: 'whisper-1',
    micDeviceId: '',
    captureSystemAudio: true,
    closeToTray: true
  }
}

/** Main-process bookkeeping that the renderer never writes (so it can't be overwritten by a settings save). */
interface AppState {
  trayHintShown?: boolean
}

export const store = {
  listNotes: () => listDir<Note>('notes'),
  saveNote: (n: Note) => writeJson(fileFor('notes', n.id), n),
  deleteNote: (id: string) => removeFile(fileFor('notes', id)),
  listChats: () => listDir<Chat>('chats'),
  saveChat: (c: Chat) => writeJson(fileFor('chats', c.id), c),
  deleteChat: (id: string) => removeFile(fileFor('chats', id)),
  getFolders: () => readJson<Folder[]>(join(root(), 'folders.json'), []),
  saveFolders: (f: Folder[]) => writeJson(join(root(), 'folders.json'), f),
  async getSettings(): Promise<Settings> {
    return { ...defaultSettings(), ...(await readJson<Partial<Settings>>(join(root(), 'settings.json'), {})) }
  },
  saveSettings: (s: Settings) => writeJson(join(root(), 'settings.json'), s),
  getAppState: () => readJson<AppState>(join(root(), 'app-state.json'), {}),
  saveAppState: (s: AppState) => writeJson(join(root(), 'app-state.json'), s)
}

/** The model Odysseus uses by default, so Cereal matches it out of the box. */
export async function odysseusDefaultModel(odysseusDir: string): Promise<string | null> {
  if (!odysseusDir) return null
  const s = await readJson<{ default_model?: string } | null>(join(odysseusDir, 'data', 'settings.json'), null)
  return s?.default_model || null
}
