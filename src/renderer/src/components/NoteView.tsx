import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  Clock,
  Copy,
  Ellipsis,
  FileText,
  Folder,
  Mail,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { complete, stream } from '../lib/llm'
import { enhancedHtml, mdToHtml } from '../lib/markdown'
import { enhanceMessages, noteChatMessages, titleMessages } from '../lib/prompts'
import { clearSessionError, getSession, stopRecording, useSession, whenTranscribed } from '../lib/session'
import { contextTokens, deleteNote, getNote, getState, navigate, updateNote, useStore } from '../lib/state'
import { TEMPLATES, templateById } from '../lib/templates'
import { duration, htmlToText, shortDate } from '../lib/util'
import { Topbar, useMenu } from './Common'
import { AskBar, ChatPanel, RecordingControls, TranscriptPanel } from './Dock'
import { Editor } from './Editor'
import { NewNoteButton } from './Home'

const cleanTitle = (t: string): string =>
  t
    .split('\n')[0]
    .replace(/^["'#*\s]+|["'.*\s]+$/g, '')
    .slice(0, 90)

export function NoteView({ id, onNew }: { id: string; onNew: () => void }): ReactNode {
  const note = useStore((s) => s.notes.find((n) => n.id === id))
  const folders = useStore((s) => s.folders)
  const session = useSession()
  const menu = useMenu()
  const [panel, setPanel] = useState<'transcript' | 'chat' | null>(null)
  const [gen, setGen] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const abortGen = useRef<(() => void) | null>(null)
  const editorRef = useRef<TiptapEditor | null>(null)
  const onEditor = useCallback((e: TiptapEditor) => {
    editorRef.current = e
  }, [])

  if (!note) {
    return (
      <>
        <Topbar />
        <div className="empty">This note was deleted.</div>
      </>
    )
  }

  const recordingHere = session.noteId === id && session.status !== 'idle'
  const folder = folders.find((f) => f.id === note.folderId)
  const template = templateById(note.templateId)
  const hasMaterial = note.transcript.length > 0 || htmlToText(note.myNotes).length > 0
  const showingEnhanced = note.view === 'enhanced' && !!note.enhanced

  async function generate(templateId: string): Promise<void> {
    setError(null)
    setPanel(null)
    if (getSession().noteId === id) await stopRecording()
    setGen('')
    await whenTranscribed()
    const current = getNote(id)
    if (!current) return
    const { settings } = getState()
    updateNote(id, { templateId })
    const s = stream(
      {
        messages: enhanceMessages(current, templateById(templateId), settings.userName, contextTokens(settings)),
        temperature: 0.2,
        purpose: 'notes'
      },
      setGen
    )
    abortGen.current = s.abort
    try {
      const md = await s.promise
      if (!md.trim()) throw new Error('The model returned an empty response.')
      updateNote(id, { enhanced: enhancedHtml(md, htmlToText(current.myNotes)), view: 'enhanced' })
      setEditorKey((k) => k + 1)
      if (!getNote(id)?.title.trim()) {
        const title = cleanTitle(
          await complete({ messages: titleMessages(getNote(id) ?? current, settings.userName), purpose: 'title' })
        )
        if (title) updateNote(id, (n) => (n.title.trim() ? {} : { title }))
      }
    } catch (e) {
      setError(`Couldn't generate notes: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      abortGen.current = null
      setGen(null)
    }
  }

  async function ask(question: string): Promise<void> {
    const current = getNote(id)
    if (!current) return
    const { settings } = getState()
    setPanel('chat')
    setChatError(null)
    const past = current.chat
    updateNote(id, (n) => ({ chat: [...n.chat, { role: 'user', content: question, at: Date.now() }] }))
    setAnswer('')
    try {
      const reply = await stream(
        { messages: noteChatMessages(current, past, question, settings.userName, contextTokens(settings)), purpose: 'chat' },
        setAnswer
      ).promise
      updateNote(id, (n) => ({ chat: [...n.chat, { role: 'assistant', content: reply, at: Date.now() }] }))
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e))
    } finally {
      setAnswer(null)
    }
  }

  const switchView = (view: 'mine' | 'enhanced'): void => {
    updateNote(id, { view })
    setEditorKey((k) => k + 1)
  }

  const viewMenu = (el: Element): void =>
    menu.open(el, [
      { label: 'My notes', icon: <FileText size={14} />, checked: !showingEnhanced, onSelect: () => switchView('mine') },
      {
        label: 'Enhanced notes',
        icon: <Sparkles size={14} />,
        checked: showingEnhanced,
        disabled: !note.enhanced,
        onSelect: () => switchView('enhanced')
      },
      'sep',
      { heading: note.enhanced ? 'Regenerate with template' : 'Generate with template' },
      ...TEMPLATES.map((t) => ({
        label: t.name,
        desc: t.description,
        checked: note.enhanced ? t.id === note.templateId : false,
        disabled: !hasMaterial,
        onSelect: () => void generate(t.id)
      }))
    ])

  const folderMenu = (el: Element): void =>
    menu.open(el, [
      { label: 'My notes', checked: !note.folderId, onSelect: () => updateNote(id, { folderId: null }) },
      ...folders.map((f) => ({ label: f.name, checked: f.id === note.folderId, onSelect: () => updateNote(id, { folderId: f.id }) }))
    ])

  const moreMenu = (el: Element): void =>
    menu.open(el, [
      {
        label: 'Copy notes',
        icon: <Copy size={14} />,
        onSelect: () => void navigator.clipboard.writeText(htmlToText(showingEnhanced ? (note.enhanced ?? '') : note.myNotes))
      },
      {
        label: 'Copy transcript',
        icon: <Copy size={14} />,
        disabled: note.transcript.length === 0,
        onSelect: () =>
          void navigator.clipboard.writeText(
            note.transcript.map((e) => `${e.speaker === 'me' ? getState().settings.userName || 'Me' : 'Them'}: ${e.text}`).join('\n')
          )
      },
      'sep',
      {
        label: 'Delete note',
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => {
          if (recordingHere) void stopRecording()
          deleteNote(id)
        }
      }
    ])

  const generating = gen !== null
  const canGenerate = hasMaterial && !generating && !note.enhanced && !recordingHere

  return (
    <>
      <Topbar
        left={
          <button className="icon-btn round" title="Home" onClick={() => navigate({ name: 'home' })}>
            <ChevronLeft size={16} />
          </button>
        }
        right={<NewNoteButton onNew={onNew} />}
      />
      <div className="scroll">
        <div className="column">
          <input
            className="note-title"
            value={note.title}
            placeholder="New note"
            onChange={(e) => updateNote(id, { title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') editorRef.current?.commands.focus('end')
            }}
          />
          <div className="chips">
            <button className={`chip ${showingEnhanced ? 'active' : ''}`} onClick={(e) => viewMenu(e.currentTarget)}>
              {showingEnhanced ? <Sparkles size={13} /> : <FileText size={13} />}
              {showingEnhanced ? template.name : 'My notes'}
              <ChevronDown size={13} />
            </button>
            <span className="chip ghost">
              <Calendar size={13} />
              {shortDate(note.createdAt)}
            </span>
            {note.recordedMs > 0 && (
              <span className="chip ghost">
                <Clock size={13} />
                {note.recordedMs < 60_000 ? duration(note.recordedMs) : `${Math.round(note.recordedMs / 60_000)} min`}
              </span>
            )}
            <button className="chip ghost" onClick={(e) => folderMenu(e.currentTarget)}>
              <Folder size={13} />
              {folder ? folder.name : 'Add to space'}
            </button>
            <button className="chip ghost" onClick={(e) => moreMenu(e.currentTarget)} aria-label="More">
              <Ellipsis size={14} />
            </button>
          </div>

          {(error || session.error) && (
            <div className="banner error">
              <span style={{ flex: 1 }}>{error || session.error}</span>
              <button
                className="icon-btn"
                onClick={() => {
                  setError(null)
                  clearSessionError()
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {generating ? (
            <div
              className="prose streaming"
              dangerouslySetInnerHTML={{
                __html: gen ? mdToHtml(gen) : '<p style="color:var(--ink-2)">Writing your notes…</p>'
              }}
            />
          ) : showingEnhanced ? (
            <Editor
              key={`e-${editorKey}`}
              content={note.enhanced ?? ''}
              placeholder="Enhanced notes"
              onChange={(html) => updateNote(id, { enhanced: html })}
              onEditor={onEditor}
            />
          ) : (
            <Editor
              key={`m-${editorKey}`}
              content={note.myNotes}
              placeholder={recordingHere ? 'Write notes… Cereal is transcribing' : 'Write notes…'}
              onChange={(html) => updateNote(id, { myNotes: html })}
              onEditor={onEditor}
            />
          )}
        </div>
      </div>

      <div className="dock">
        {panel === 'transcript' && <TranscriptPanel note={note} onClose={() => setPanel(null)} />}
        {panel === 'chat' && (
          <ChatPanel
            title="Ask about this note"
            messages={note.chat}
            streaming={answer}
            error={chatError}
            onClose={() => setPanel(null)}
            onClear={() => updateNote(id, { chat: [] })}
          />
        )}
        {generating && (
          <button className="pill big generate" onClick={() => abortGen.current?.()}>
            <X size={15} />
            Stop generating
          </button>
        )}
        {canGenerate && panel === null && (
          <button className="pill big accent generate" onClick={() => void generate(note.templateId)}>
            <Sparkles size={15} />
            Generate notes
          </button>
        )}
        <AskBar
          busy={answer !== null}
          onSubmit={(q) => void ask(q)}
          leading={
            <RecordingControls note={note} onToggleTranscript={() => setPanel(panel === 'transcript' ? null : 'transcript')} />
          }
          recipe={
            note.transcript.length > 0 || note.enhanced
              ? {
                  label: 'Write follow-up email',
                  icon: <Mail size={15} />,
                  prompt: 'Write a short, friendly follow-up email for this meeting with the key decisions and next steps.'
                }
              : undefined
          }
        />
      </div>
      {menu.node}
    </>
  )
}
