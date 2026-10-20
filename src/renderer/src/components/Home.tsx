import type { ReactNode } from 'react'
import { CalendarClock, FileText, FolderInput, ListTodo, Plus, Trash2 } from 'lucide-react'
import type { Note } from '../../../shared/types'
import { useSession } from '../lib/session'
import { deleteNote, navigate, saveChat, updateNote, useStore } from '../lib/state'
import { dayLabel, duration, timeParts, uid } from '../lib/util'
import { Bars, Topbar, useMenu } from './Common'
import { AskBar } from './Dock'

export function NewNoteButton({ onNew }: { onNew: () => void }): ReactNode {
  return (
    <button className="pill" onClick={onNew}>
      <Plus size={15} />
      New note
    </button>
  )
}

export function startGlobalChat(question: string): void {
  const now = Date.now()
  const id = uid()
  saveChat({ id, title: question.slice(0, 80), createdAt: now, updatedAt: now, messages: [{ role: 'user', content: question, at: now }] })
  navigate({ name: 'chat', id })
}

function NoteRow({ note, onMenu }: { note: Note; onMenu: (e: React.MouseEvent, n: Note) => void }): ReactNode {
  const session = useSession()
  const folders = useStore((s) => s.folders)
  const recording = session.noteId === note.id && session.status === 'recording'
  const folder = folders.find((f) => f.id === note.folderId)
  const { time, ampm } = timeParts(note.createdAt)
  const sub = [folder?.name ?? 'Me', note.recordedMs > 60_000 ? `${Math.round(note.recordedMs / 60_000)} min` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      className="note-row"
      onClick={() => navigate({ name: 'note', id: note.id })}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e, note)
      }}
    >
      <span className="icon">{recording ? <Bars live /> : <FileText size={15} />}</span>
      <span style={{ minWidth: 0 }}>
        <div className={`title ${note.title ? '' : 'untitled'}`}>{note.title || 'Untitled note'}</div>
        <div className="sub">{recording ? `Transcribing · ${duration(note.recordedMs)}` : sub}</div>
      </span>
      <span className="time">
        {time}
        <small>{ampm}</small>
      </span>
    </button>
  )
}

export function NoteList({ notes, emptyHint }: { notes: Note[]; emptyHint: string }): ReactNode {
  const folders = useStore((s) => s.folders)
  const menu = useMenu()
  if (notes.length === 0) {
    return (
      <div className="empty">
        <div className="big">Nothing here yet</div>
        {emptyHint}
      </div>
    )
  }
  const sorted = [...notes].sort((a, b) => b.createdAt - a.createdAt)
  const groups: { label: string; notes: Note[] }[] = []
  for (const n of sorted) {
    const label = dayLabel(n.createdAt)
    const g = groups[groups.length - 1]
    if (g && g.label === label) g.notes.push(n)
    else groups.push({ label, notes: [n] })
  }
  const openMenu = (e: React.MouseEvent, n: Note): void => {
    menu.open(new DOMRect(e.clientX, e.clientY, 0, 0), [
      { heading: 'Move to space' },
      { label: 'My notes', checked: !n.folderId, icon: <FolderInput size={14} />, onSelect: () => updateNote(n.id, { folderId: null }) },
      ...folders.map((f) => ({
        label: f.name,
        checked: n.folderId === f.id,
        icon: <FolderInput size={14} />,
        onSelect: () => updateNote(n.id, { folderId: f.id })
      })),
      'sep' as const,
      { label: 'Delete note', danger: true, icon: <Trash2 size={14} />, onSelect: () => deleteNote(n.id) }
    ])
  }
  return (
    <div>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="group-label">{g.label}</div>
          {g.notes.map((n) => (
            <NoteRow key={n.id} note={n} onMenu={openMenu} />
          ))}
        </div>
      ))}
      {menu.node}
    </div>
  )
}

function ComingUp({ onNew }: { onNew: () => void }): ReactNode {
  const session = useSession()
  const live = useStore((s) => (session.noteId ? s.notes.find((n) => n.id === session.noteId) : undefined))
  const now = new Date()
  return (
    <div className="coming-up">
      <div className="date-block">
        <div className="num">{now.getDate()}</div>
        <div>
          <div className="month">{now.toLocaleDateString(undefined, { month: 'long' })}</div>
          <div className="weekday">{now.toLocaleDateString(undefined, { weekday: 'short' })}</div>
        </div>
      </div>
      <div className="events">
        {live ? (
          <button className="live-card" onClick={() => navigate({ name: 'note', id: live.id })}>
            <Bars live={session.status === 'recording'} />
            <span>
              <div className="t">{live.title || 'Untitled note'}</div>
              <div className="s">{session.status === 'paused' ? 'Paused · click to open' : 'Transcribing now · click to open'}</div>
            </span>
          </button>
        ) : (
          <>
            <CalendarClock size={20} color="var(--ink-2)" />
            <div className="headline">No upcoming events</div>
            <div className="hint">Start a note when your meeting begins</div>
            <button className="pill" onClick={onNew}>
              Quick note
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function Home({ onNew }: { onNew: () => void }): ReactNode {
  const notes = useStore((s) => s.notes)
  return (
    <>
      <Topbar right={<NewNoteButton onNew={onNew} />} />
      <div className="scroll">
        <div className="column">
          <h1 className="page-title">Coming up</h1>
          <ComingUp onNew={onNew} />
          <NoteList notes={notes} emptyHint="Press New note when a meeting starts. Cereal transcribes it locally." />
        </div>
      </div>
      <div className="dock">
        <AskBar
          onSubmit={startGlobalChat}
          recipe={{ label: 'List recent todos', icon: <ListTodo size={15} />, prompt: 'List my action items and todos from recent meetings, grouped by meeting.' }}
        />
      </div>
    </>
  )
}

export function FolderView({ id, onNew }: { id: string | null; onNew: () => void }): ReactNode {
  const folder = useStore((s) => s.folders.find((f) => f.id === id))
  const allNotes = useStore((s) => s.notes)
  const notes = id ? allNotes.filter((n) => n.folderId === id) : allNotes
  return (
    <>
      <Topbar right={<NewNoteButton onNew={onNew} />} />
      <div className="scroll">
        <div className="column">
          <h1 className="page-title">{id ? (folder?.name ?? 'Space') : 'My notes'}</h1>
          <NoteList
            notes={notes}
            emptyHint={id ? 'New notes made here land in this space. Right-click a note to move it.' : 'Your notes will appear here.'}
          />
        </div>
      </div>
      <div className="dock">
        <AskBar onSubmit={startGlobalChat} />
      </div>
    </>
  )
}
