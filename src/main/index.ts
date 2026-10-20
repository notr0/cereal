import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import type { Chat, Folder, LlmRequest, Note, Settings } from '../shared/types'
import { claudeKeyInfo, setClaudeKey } from './claude'
import { abortChat, llmStatus, resolveModel, streamChat } from './llm'
import { store } from './store'
import { transcribeRemote } from './stt'

const OVERLAY = {
  light: { color: '#fcfcf8', symbolColor: '#4e4d4b' },
  dark: { color: '#292929', symbolColor: '#acada8' }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Cereal',
    backgroundColor: OVERLAY.light.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...OVERLAY.light, height: 44 },
    // The packaged exe carries the icon itself; in dev, point the window at it.
    ...(app.isPackaged ? {} : { icon: join(app.getAppPath(), 'build', 'icon.ico') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function registerIpc(): void {
  ipcMain.handle('store:listNotes', () => store.listNotes())
  ipcMain.handle('store:saveNote', (_e, n: Note) => store.saveNote(n))
  ipcMain.handle('store:deleteNote', (_e, id: string) => store.deleteNote(id))
  ipcMain.handle('store:listChats', () => store.listChats())
  ipcMain.handle('store:saveChat', (_e, c: Chat) => store.saveChat(c))
  ipcMain.handle('store:deleteChat', (_e, id: string) => store.deleteChat(id))
  ipcMain.handle('store:getFolders', () => store.getFolders())
  ipcMain.handle('store:saveFolders', (_e, f: Folder[]) => store.saveFolders(f))
  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:save', (_e, s: Settings) => store.saveSettings(s))

  ipcMain.handle('llm:chat', (e, id: string, req: LlmRequest) => {
    void streamChat(e.sender, id, req)
  })
  ipcMain.handle('llm:abort', (_e, id: string) => abortChat(id))
  ipcMain.handle('llm:status', () => llmStatus())
  ipcMain.handle('llm:model', () => resolveModel().catch(() => ''))
  ipcMain.handle('stt:transcribe', (_e, wav: ArrayBuffer) => transcribeRemote(wav))
  // The key goes in but never comes back out to the renderer; only a 4-character hint does.
  ipcMain.handle('secrets:setClaudeKey', (_e, key: string | null) => setClaudeKey(key))
  ipcMain.handle('secrets:claudeKeyInfo', () => claudeKeyInfo())

  ipcMain.on('window:theme', (e, dark: boolean) => {
    BrowserWindow.fromWebContents(e.sender)?.setTitleBarOverlay(dark ? OVERLAY.dark : OVERLAY.light)
    BrowserWindow.fromWebContents(e.sender)?.setBackgroundColor(dark ? OVERLAY.dark.color : OVERLAY.light.color)
  })
  ipcMain.on('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
}

app.whenReady().then(() => {
  // System audio ("Them" in the transcript) is captured as Windows loopback audio through getDisplayMedia.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
        .catch(() => callback({}))
    },
    { useSystemPicker: false }
  )
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'clipboard-sanitized-write', 'notifications'].includes(permission))
  })
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
