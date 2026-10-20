import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ChevronUp, LoaderCircle, Mic, Pause, Play, Square, X } from 'lucide-react'
import type { ChatMessage, Note } from '../../../shared/types'
import {
  elapsedMs,
  pauseRecording,
  resumeRecording,
  startRecording,
  stopRecording,
  useSession
} from '../lib/session'
import { useStore } from '../lib/state'
import { duration } from '../lib/util'
import { Bars, Markdown } from './Common'

export function AskBar({
  placeholder = 'Ask anything',
  onSubmit,
  recipe,
  leading,
  busy,
  autoFocus
}: {
  placeholder?: string
  onSubmit: (text: string) => void
  recipe?: { label: string; icon: ReactNode; prompt: string }
  leading?: ReactNode
  busy?: boolean
  autoFocus?: boolean
}): ReactNode {
  const [text, setText] = useState('')
  const submit = (q: string): void => {
    const v = q.trim()
    if (!v || busy) return
    onSubmit(v)
    setText('')
  }
  return (
    <div className="askbar">
      {leading}
      <input
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit(text)
        }}
      />
      {text.trim() ? (
        <button className="send" disabled={busy} onClick={() => submit(text)} aria-label="Send">
          {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={17} />}
        </button>
      ) : (
        recipe && (
          <button className="pill recipe" disabled={busy} onClick={() => submit(recipe.prompt)}>
            {recipe.icon}
            {recipe.label}
          </button>
        )
      )}
    </div>
  )
}

export function Timer(): ReactNode {
  const [, tick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(i)
  }, [])
  return <span>{duration(elapsedMs())}</span>
}

/** The left side of the note dock: live meter and timer, or resume/start controls. */
export function RecordingControls({ note, onToggleTranscript }: { note: Note; onToggleTranscript: () => void }): ReactNode {
  const s = useSession()
  const mine = s.noteId === note.id
  const live = mine && s.status === 'recording'
  const starting = mine && s.status === 'starting'
  const paused = mine && s.status === 'paused'
  if (live || paused || starting) {
    return (
      <>
        <button className={`rec-pill ${live ? 'live' : ''}`} onClick={onToggleTranscript} title="Show transcript">
          {starting ? <LoaderCircle size={15} className="spin" /> : <Bars live={live} />}
          {paused ? 'Paused' : <Timer />}
          <ChevronUp size={14} />
        </button>
        <button
          className="icon-btn round"
          title={paused ? 'Resume' : 'Pause'}
          onClick={() => void (paused ? resumeRecording() : pauseRecording())}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button className="icon-btn round" title="Stop transcribing" onClick={() => void stopRecording()}>
          <Square size={12} fill="currentColor" />
        </button>
      </>
    )
  }
  if (note.transcript.length === 0) {
    return (
      <button className="rec-pill" onClick={() => void startRecording(note.id)} title="Start transcribing">
        <Mic size={15} />
        Start
      </button>
    )
  }
  return (
    <>
      <button className="rec-pill" onClick={onToggleTranscript} title="Show transcript">
        <Bars live={false} />
        <ChevronUp size={14} />
      </button>
      <button className="pill" style={{ height: 36 }} onClick={() => void startRecording(note.id)}>
        <Play size={13} />
        Resume
      </button>
    </>
  )
}

export function TranscriptPanel({ note, onClose }: { note: Note; onClose: () => void }): ReactNode {
  const s = useSession()
  const userName = useStore((st) => st.settings.userName)
  const body = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useEffect(() => {
    const el = body.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [note.transcript.length, s.pending])
  const mine = s.noteId === note.id
  return (
    <div className="popover panel">
      <div className="panel-head">
        Transcript
        <span className="meta">
          {mine && s.status === 'recording' ? (s.system ? 'Listening to you and the call' : 'Listening to your mic only') : ''}
        </span>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div
        className="panel-body"
        ref={body}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {note.transcript.length === 0 && !s.sttStatus && (
          <div className="transcript-status">{mine ? 'Waiting for someone to speak…' : 'No transcript yet.'}</div>
        )}
        {note.transcript.map((e, i) => {
          const showWho = i === 0 || note.transcript[i - 1].speaker !== e.speaker
          return (
            <div key={e.id} className={`bubble-row ${e.speaker}`}>
              <div className="bubble">
                {showWho && <div className="bubble-who">{e.speaker === 'me' ? userName || 'Me' : 'Them'}</div>}
                {e.text}
              </div>
            </div>
          )
        })}
        {mine && s.sttStatus && <div className="transcript-status">{s.sttStatus}</div>}
        {mine && s.pending > 0 && !s.sttStatus && (
          <div className="transcript-status">
            <LoaderCircle size={12} className="spin" style={{ verticalAlign: -2, marginRight: 6 }} />
            Transcribing…
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatPanel({
  title,
  messages,
  streaming,
  error,
  onClose,
  onClear
}: {
  title: string
  messages: ChatMessage[]
  streaming: string | null
  error: string | null
  onClose: () => void
  onClear?: () => void
}): ReactNode {
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight
  }, [messages.length, streaming])
  return (
    <div className="popover panel">
      <div className="panel-head">
        {title}
        <span style={{ flex: 1 }} />
        {onClear && messages.length > 0 && (
          <button className="chip ghost" onClick={onClear}>
            Clear
          </button>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="panel-body" ref={body}>
        <ChatThread messages={messages} streaming={streaming} error={error} />
      </div>
    </div>
  )
}

export function ChatThread({
  messages,
  streaming,
  error
}: {
  messages: ChatMessage[]
  streaming: string | null
  error: string | null
}): ReactNode {
  return (
    <>
      {messages.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="chat-msg user">
            <div className="bubble">{m.content}</div>
          </div>
        ) : (
          <div key={i} className="chat-msg">
            <Markdown text={m.content} />
          </div>
        )
      )}
      {streaming !== null && (
        <div className="chat-msg">
          {streaming ? (
            <Markdown text={streaming} />
          ) : (
            <span style={{ color: 'var(--ink-2)' }}>
              <LoaderCircle size={14} className="spin" style={{ verticalAlign: -2, marginRight: 6 }} />
              Thinking…
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="chat-msg">
          <span className="error">{error}</span>
        </div>
      )}
    </>
  )
}
