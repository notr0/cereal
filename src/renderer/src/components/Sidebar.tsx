import { useState, type ReactNode } from 'react'
import { Ellipsis, Folder, House, Lock, MessageCircle, Moon, Pencil, Plus, Search, Settings, Sun, Trash2 } from 'lucide-react'
import {
  createFolder,
  deleteFolder,
  navigate,
  renameFolder,
  setState,
  updateSettings,
  useStore,
  type Route
} from '../lib/state'
import { claudeModelName } from '../../../shared/models'
import { Logo, useMenu } from './Common'

const isActive = (route: Route, target: Route): boolean =>
  route.name === target.name && ('id' in route ? 'id' in target && route.id === target.id : true)

function InlineInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }): ReactNode {
  const [v, setV] = useState(initial)
  return (
    <input
      className="input"
      style={{ height: 30, margin: '2px 0' }}
      autoFocus
      value={v}
      placeholder="Space name"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(v.trim() || null)
        if (e.key === 'Escape') onDone(null)
      }}
    />
  )
}

export function Sidebar(): ReactNode {
  const open = useStore((s) => s.sidebarOpen)
  const route = useStore((s) => s.route)
  const folders = useStore((s) => s.folders)
  const llm = useStore((s) => s.llm)
  const model = useStore((s) => s.model)
  const dark = useStore((s) => s.dark)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const menu = useMenu()

  const item = (target: Route, icon: ReactNode, label: string, trailing?: ReactNode): ReactNode => (
    <button className={`nav-item ${isActive(route, target) ? 'active' : ''}`} onClick={() => navigate(target)}>
      {icon}
      <span className="label">{label}</span>
      {trailing}
    </button>
  )

  return (
    <aside className={`sidebar ${open ? '' : 'closed'}`}>
      <div className="sidebar-top drag" />
      <div className="sidebar-scroll">
        <button className="search-button" onClick={() => setState({ searchOpen: true })}>
          <Search size={15} />
          Search
          <kbd>Ctrl+K</kbd>
        </button>
        {item({ name: 'home' }, <House size={16} />, 'Home')}
        {item({ name: 'chats' }, <MessageCircle size={16} />, 'Chat')}

        <div className="section-label">
          Spaces
          <button className="icon-btn" style={{ width: 22, height: 22 }} title="New space" onClick={() => setAdding(true)}>
            <Plus size={14} />
          </button>
        </div>
        {item(
          { name: 'folder', id: null },
          <span className="space-icon">
            <Lock size={11} />
          </span>,
          'My notes'
        )}
        {folders.map((f) =>
          renaming === f.id ? (
            <InlineInput
              key={f.id}
              initial={f.name}
              onDone={(v) => {
                if (v) renameFolder(f.id, v)
                setRenaming(null)
              }}
            />
          ) : (
            <div key={f.id}>
              {item(
                { name: 'folder', id: f.id },
                <span className="space-icon">
                  <Folder size={11} />
                </span>,
                f.name,
                <span
                  className="trailing"
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    menu.open(e.currentTarget, [
                      { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => setRenaming(f.id) },
                      { label: 'Delete space', icon: <Trash2 size={14} />, danger: true, onSelect: () => deleteFolder(f.id) }
                    ])
                  }}
                >
                  <Ellipsis size={15} />
                </span>
              )}
            </div>
          )
        )}
        {adding && (
          <InlineInput
            initial=""
            onDone={(v) => {
              if (v) navigate({ name: 'folder', id: createFolder(v).id })
              setAdding(false)
            }}
          />
        )}
      </div>

      <div className="sidebar-bottom">
        <div className="icon-row">
          <button className="icon-btn" title="Settings" onClick={() => setState({ settingsOpen: true })}>
            <Settings size={16} />
          </button>
          <button
            className="icon-btn"
            title={dark ? 'Light mode' : 'Dark mode'}
            onClick={() => void updateSettings({ theme: dark ? 'light' : 'dark' })}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <button className="status-card" onClick={() => setState({ settingsOpen: true })}>
          <span className={`dot ${llm ? (llm.ok ? 'ok' : 'bad') : ''}`} />
          <span style={{ minWidth: 0 }}>
            <div className="title">
              {!llm
                ? 'Checking AI…'
                : llm.provider === 'claude'
                  ? llm.ok
                    ? 'Claude API ready'
                    : 'Claude not connected'
                  : llm.ok
                    ? 'Local AI ready'
                    : 'Ollama offline'}
            </div>
            <div className="sub">
              {llm?.ok ? (llm.provider === 'claude' ? claudeModelName(model) : model || 'No model selected') : 'Open settings'}
            </div>
          </span>
        </button>
        <div className="brand">
          <Logo size={20} />
          Cereal
        </div>
      </div>
      {menu.node}
    </aside>
  )
}
