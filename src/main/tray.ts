import { app, Tray } from 'electron'
import { join } from 'node:path'
import type { TrayCommand, TraySession } from '../shared/types'
import { TrayMenu, type TrayMenuItem } from './trayMenu'

const iconPath = (name: string): string =>
  app.isPackaged ? join(process.resourcesPath, 'tray', name) : join(app.getAppPath(), 'build', 'tray', name)

// Launched at login with --hidden so Cereal starts straight into the tray.
const LOGIN_ITEM = { path: process.execPath, args: ['--hidden'] }

export function openAtLogin(): boolean {
  return app.isPackaged && app.getLoginItemSettings(LOGIN_ITEM).openAtLogin
}

export function setOpenAtLogin(on: boolean): void {
  // In dev the "app" is electron.exe plus a project path, which shouldn't be registered at login.
  if (app.isPackaged) app.setLoginItemSettings({ ...LOGIN_ITEM, openAtLogin: on })
}

export class CerealTray {
  private tray: Tray
  private menu = new TrayMenu()
  private session: TraySession = { status: 'idle', title: '' }

  constructor(
    private readonly show: () => void,
    private readonly command: (c: TrayCommand) => void,
    private readonly quit: () => void
  ) {
    this.tray = new Tray(iconPath('tray.ico'))
    this.tray.on('click', () => {
      this.menu.close()
      this.show()
    })
    this.tray.on('right-click', () => this.menu.popUp())
    this.render()
  }

  setSession(session: TraySession): void {
    if (session.status === this.session.status && session.title === this.session.title) return
    this.session = session
    this.render()
  }

  /** Rebuilds the menu, e.g. after the open-at-login setting changes elsewhere. */
  refresh(): void {
    this.render()
  }

  showHint(): void {
    this.tray.displayBalloon({
      title: 'Cereal is still running',
      content: 'It keeps transcribing in the background. Click the tray icon to reopen it, or right-click to quit.',
      noSound: true
    })
  }

  private render(): void {
    const { status, title } = this.session
    const live = status === 'recording' || status === 'paused'
    const what = status === 'paused' ? 'Paused' : 'Transcribing'
    this.tray.setImage(iconPath(live ? 'tray-recording.ico' : 'tray.ico'))
    this.tray.setToolTip(live ? `Cereal · ${what}${title ? `: ${title.slice(0, 60)}` : ''}` : 'Cereal')

    const items: TrayMenuItem[] = [{ label: 'Open Cereal', click: () => this.show() }]
    if (live) {
      items.push(
        { label: status === 'paused' ? 'Resume transcribing' : 'Pause transcribing', click: () => this.command('toggle-pause') },
        { label: 'Stop transcribing', click: () => this.command('stop-recording') }
      )
    } else {
      items.push({ label: 'New note', click: () => this.command('new-note') })
    }
    items.push(
      { type: 'separator' },
      {
        label: 'Open at login',
        type: 'checkbox',
        checked: openAtLogin(),
        enabled: app.isPackaged,
        click: (checked) => {
          setOpenAtLogin(checked)
          this.render()
        }
      },
      { type: 'separator' },
      { label: 'Quit Cereal', click: () => this.quit() }
    )
    this.menu.setItems(items)
  }
}
