import { BrowserWindow, nativeTheme, screen } from 'electron'

export type TrayMenuItem =
  | { type?: 'normal'; label: string; click: () => void; enabled?: boolean }
  | { type: 'checkbox'; label: string; checked: boolean; click: (checked: boolean) => void; enabled?: boolean }
  | { type: 'separator' }

const WIDTH = 232
// Each item links here; following a link runs that item instead of navigating.
const ITEM_URL = 'https://menu.invalid/'
const ITEM_HEIGHT = 32
const SEPARATOR_HEIGHT = 9
const PADDING = 4

const escape = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

// Electron's own tray menus on Windows can show the spinning "working" cursor
// (electron/electron#39981), so the tray menu is a small window of our own instead.
export class TrayMenu {
  private win: BrowserWindow | null = null
  private items: TrayMenuItem[] = []
  // Clicking the tray icon while the menu is open blurs it first; this stops that click reopening it.
  private closedAt = 0

  setItems(items: TrayMenuItem[]): void {
    this.items = items
    if (this.win) void this.load(this.win)
  }

  popUp(): void {
    if (this.win) return this.close()
    if (Date.now() - this.closedAt < 250) return
    const win = this.create()
    const height = this.height()
    const cursor = screen.getCursorScreenPoint()
    const area = screen.getDisplayNearestPoint(cursor).workArea
    // Open up and to the left of the pointer like Windows' own tray menus, kept on screen.
    const x = Math.max(area.x, Math.min(cursor.x - WIDTH, area.x + area.width - WIDTH))
    const y = Math.max(area.y, Math.min(cursor.y - height, area.y + area.height - height))
    win.setBounds({ x, y, width: WIDTH, height })
    void this.load(win).then(() => {
      if (this.win !== win) return
      win.show()
      win.focus()
    })
  }

  // The window is destroyed rather than hidden, so a leftover menu never keeps the app from quitting.
  close(): void {
    if (!this.win) return
    this.closedAt = Date.now()
    const win = this.win
    this.win = null
    if (!win.isDestroyed()) win.destroy()
  }

  private create(): BrowserWindow {
    const win = new BrowserWindow({
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      roundedCorners: true,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false, spellcheck: false }
    })
    win.setAlwaysOnTop(true, 'pop-up-menu')
    win.on('blur', () => this.close())
    win.webContents.on('will-navigate', (e, url) => {
      e.preventDefault()
      if (!url.startsWith(ITEM_URL)) return
      const item = this.items[Number(url.slice(ITEM_URL.length))]
      this.close()
      if (!item || item.type === 'separator' || item.enabled === false) return
      if (item.type === 'checkbox') item.click(!item.checked)
      else item.click()
    })
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    })
    this.win = win
    return win
  }

  private height(): number {
    // The padding and 1px border sit on both edges.
    return this.items.reduce((h, i) => h + (i.type === 'separator' ? SEPARATOR_HEIGHT : ITEM_HEIGHT), PADDING * 2 + 2)
  }

  private load(win: BrowserWindow): Promise<void> {
    win.setSize(WIDTH, this.height())
    const dark = nativeTheme.shouldUseDarkColors
    win.setBackgroundColor(dark ? '#2c2c2c' : '#f9f9f9')
    return win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.html(dark))}`)
  }

  private html(dark: boolean): string {
    const rows = this.items
      .map((item, i) => {
        if (item.type === 'separator') return '<hr>'
        const check = item.type === 'checkbox' && item.checked ? '&#x2713;' : ''
        const label = `<span class="check">${check}</span>${escape(item.label)}`
        return item.enabled === false ? `<a class="off">${label}</a>` : `<a href="${ITEM_URL}${i}">${label}</a>`
      })
      .join('')
    const [bg, fg, hover, line, off] = dark
      ? ['#2c2c2c', '#ffffff', 'rgba(255,255,255,.08)', 'rgba(255,255,255,.1)', 'rgba(255,255,255,.4)']
      : ['#f9f9f9', '#1a1a1a', 'rgba(0,0,0,.06)', 'rgba(0,0,0,.08)', 'rgba(0,0,0,.36)']
    return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:${bg};color:${fg};cursor:default;user-select:none;
  font:13px/1 'Segoe UI Variable Text','Segoe UI',sans-serif}
body{box-sizing:border-box;padding:${PADDING}px;border:1px solid ${line}}
a{display:flex;align-items:center;height:${ITEM_HEIGHT}px;padding:0 12px 0 0;border-radius:4px;color:inherit;text-decoration:none;cursor:default}
a:hover:not(.off){background:${hover}}
a.off{color:${off}}
.check{width:32px;text-align:center;flex:none}
hr{border:0;border-top:1px solid ${line};margin:4px 0;height:0}
</style></head><body>${rows}</body></html>`
  }
}
