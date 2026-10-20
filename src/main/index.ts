import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import type { AppInfo, Chat, Folder, LlmRequest, Note, Settings, TrayCommand, TraySession } from '../shared/types'
import { claudeKeyInfo, setClaudeKey } from './claude'
import { abortChat, llmStatus, resolveModel, streamChat } from './llm'
import { store } from './store'
import { transcribeRemote } from './stt'
import { CerealTray, openAtLogin, setOpenAtLogin } from './tray'

const OVERLAY = {
  light: { color: '#fcfcf8', symbolColor: '#4e4d4b' },
  dark: { color: '#292929', symbolColor: '#acada8' }
}

let win: BrowserWindow | null = null
let tray: CerealTray | null = null
let quitting = false
/** Set while the UI wraps up before exit (see finishThenQuit). */
let finishing = false
let readyToQuit = false
let closeToTray = true

// Long enough to transcribe the last few utterances on CPU, short enough that Quit never hangs.
const FINISH_TIMEOUT_MS = 20_000

function createWindow(showOnReady: boolean): BrowserWindow {
  const w = new BrowserWindow({
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
      contextIsolation: true,
      // Transcription keeps running while the window is hidden in the tray.
      backgroundThrottling: false
    }
  })
  if (showOnReady) w.once('ready-to-show', () => w.show())
  w.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    if (closeToTray) {
      w.hide()
      void showTrayHintOnce()
    } else {
      // Quit through before-quit so a recording is finished and saved first.
      app.quit()
    }
  })
  w.on('closed', () => {
    if (win === w) win = null
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
  return w
}

function showWindow(): void {
  // While quitting, a reopened window would be closed again before anything done in it is saved.
  if (finishing) return
  if (!win) win = createWindow(true)
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/**
 * Asks the UI to stop recording, transcribe what's still queued and write everything to disk,
 * then quits for real. Without this, quitting mid-meeting dropped the last unsaved edits and audio.
 */
function finishThenQuit(w: BrowserWindow): void {
  if (finishing) return
  finishing = true
  w.hide()
  let timer: ReturnType<typeof setTimeout> | undefined
  const done = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, FINISH_TIMEOUT_MS)
    ipcMain.once('app:readyToQuit', () => resolve())
    // A renderer that dies mid-way will never answer.
    w.webContents.once('render-process-gone', () => resolve())
  })
  w.webContents.send('app:prepareQuit')
  void done.then(() => {
    clearTimeout(timer)
    readyToQuit = true
    app.quit()
  })
}

function sendCommand(command: TrayCommand): void {
  if (finishing) return
  if (command === 'new-note') showWindow()
  win?.webContents.send('app:command', command)
}

async function showTrayHintOnce(): Promise<void> {
  const state = await store.getAppState()
  if (state.trayHintShown) return
  tray?.showHint()
  await store.saveAppState({ ...state, trayHintShown: true })
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
  ipcMain.handle('settings:save', (_e, s: Settings) => {
    closeToTray = s.closeToTray
    return store.saveSettings(s)
  })

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

  ipcMain.handle('app:info', (): AppInfo => ({ packaged: app.isPackaged, openAtLogin: openAtLogin() }))
  ipcMain.handle('app:setOpenAtLogin', (_e, on: boolean) => {
    setOpenAtLogin(on)
    tray?.refresh()
    return openAtLogin()
  })
  ipcMain.on('app:session', (_e, s: TraySession) => tray?.setSession(s))

  ipcMain.on('window:theme', (e, dark: boolean) => {
    BrowserWindow.fromWebContents(e.sender)?.setTitleBarOverlay(dark ? OVERLAY.dark : OVERLAY.light)
    BrowserWindow.fromWebContents(e.sender)?.setBackgroundColor(dark ? OVERLAY.dark.color : OVERLAY.light.color)
  })
  ipcMain.on('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
}

// One Cereal at a time: launching it again (Start menu, desktop) brings the running one forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Launched again while the last quit is still saving: start fresh once this one exits.
    if (finishing) app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--hidden') })
    else showWindow()
  })

  app.whenReady().then(async () => {
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
    closeToTray = (await store.getSettings()).closeToTray
    registerIpc()
    tray = new CerealTray(showWindow, sendCommand, () => app.quit())
    win = createWindow(!process.argv.includes('--hidden'))
  })

  app.on('before-quit', (e) => {
    const w = win
    // A page that hasn't loaded yet has nothing to save and no listener to answer.
    const canFinish =
      !!w && !w.isDestroyed() && !w.webContents.isDestroyed() && !w.webContents.isCrashed() && !w.webContents.isLoadingMainFrame()
    if (!readyToQuit && w && canFinish) {
      e.preventDefault()
      finishThenQuit(w)
      return
    }
    quitting = true
  })

  app.on('window-all-closed', () => {
    // With close-to-tray on, windows hide instead of closing, so this only runs when quitting
    // or when the user turned the tray off.
    app.quit()
  })
}
