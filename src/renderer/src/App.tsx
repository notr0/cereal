import { useEffect, type ReactNode } from 'react'
import { PanelLeft } from 'lucide-react'
import { getSession, pauseRecording, resumeRecording, startRecording, stopRecording, useSession } from './lib/session'
import { createNote, getState, setState, useStore } from './lib/state'
import { ChatList, ChatView } from './components/ChatView'
import { FolderView, Home } from './components/Home'
import { NoteView } from './components/NoteView'
import { SearchPalette } from './components/SearchPalette'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'

/** New notes start transcribing right away, like a quick note in Granola. */
function newNote(): void {
  const { route } = getState()
  const note = createNote(route.name === 'folder' ? route.id : null)
  void startRecording(note.id)
}

/** Keeps the tray icon in sync with recording and carries out tray menu commands. */
function TrayBridge(): ReactNode {
  const session = useSession()
  const title = useStore((s) => (session.noteId ? (s.notes.find((n) => n.id === session.noteId)?.title ?? '') : ''))

  useEffect(() => {
    window.cereal.app.reportSession({ status: session.status, title: session.noteId ? title || 'Untitled note' : '' })
  }, [session.status, session.noteId, title])

  useEffect(
    () =>
      window.cereal.app.onCommand((command) => {
        if (command === 'new-note') newNote()
        else if (command === 'stop-recording') void stopRecording()
        else void (getSession().status === 'paused' ? resumeRecording() : pauseRecording())
      }),
    []
  )
  return null
}

export function App(): ReactNode {
  const ready = useStore((s) => s.ready)
  const route = useStore((s) => s.route)
  const searchOpen = useStore((s) => s.searchOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        setState((s) => ({ searchOpen: !s.searchOpen }))
      } else if (k === 'n') {
        e.preventDefault()
        newNote()
      } else if (k === '\\') {
        e.preventDefault()
        setState((s) => ({ sidebarOpen: !s.sidebarOpen }))
      } else if (k === ',') {
        e.preventDefault()
        setState({ settingsOpen: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) return null

  let page: ReactNode
  switch (route.name) {
    case 'note':
      page = <NoteView key={route.id} id={route.id} onNew={newNote} />
      break
    case 'chat':
      page = <ChatView key={route.id} id={route.id} onNew={newNote} />
      break
    case 'chats':
      page = <ChatList onNew={newNote} />
      break
    case 'folder':
      page = <FolderView key={route.id ?? 'all'} id={route.id} onNew={newNote} />
      break
    default:
      page = <Home onNew={newNote} />
  }

  return (
    <div className={`app platform-${window.cereal.platform}`}>
      <TrayBridge />
      <button
        className="icon-btn sidebar-toggle no-drag"
        title="Toggle sidebar (Ctrl+\)"
        onClick={() => setState((s) => ({ sidebarOpen: !s.sidebarOpen }))}
      >
        <PanelLeft size={17} />
      </button>
      <Sidebar />
      <main className="main">{page}</main>
      {searchOpen && <SearchPalette />}
      {settingsOpen && <SettingsModal />}
    </div>
  )
}
