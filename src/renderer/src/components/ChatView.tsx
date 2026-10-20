import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ListTodo, MessageCircle, Trash2 } from 'lucide-react'
import { stream } from '../lib/llm'
import { globalChatMessages } from '../lib/prompts'
import { contextTokens, deleteChat, getState, navigate, saveChat, useStore } from '../lib/state'
import { dayLabel } from '../lib/util'
import { Topbar } from './Common'
import { AskBar, ChatThread } from './Dock'
import { NewNoteButton, startGlobalChat } from './Home'

export function ChatList({ onNew }: { onNew: () => void }): ReactNode {
  const chats = useStore((s) => s.chats)
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
  return (
    <>
      <Topbar right={<NewNoteButton onNew={onNew} />} />
      <div className="scroll">
        <div className="column">
          <h1 className="page-title">Chat</h1>
          <p style={{ color: 'var(--ink-2)', margin: '-8px 4px 16px' }}>Ask questions across all your meeting notes. Answers come from your local model.</p>
          {sorted.length === 0 && (
            <div className="empty">
              <div className="big">No chats yet</div>
              Try asking what you committed to this week.
            </div>
          )}
          {sorted.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center' }}>
              <button className="chat-list-row" onClick={() => navigate({ name: 'chat', id: c.id })}>
                <span className="space-icon" style={{ width: 30, height: 30, borderRadius: 8 }}>
                  <MessageCircle size={14} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                  <div className="time">
                    {dayLabel(c.updatedAt)} · {c.messages.length} messages
                  </div>
                </span>
              </button>
              <button className="icon-btn" title="Delete chat" onClick={() => deleteChat(c.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="dock">
        <AskBar
          onSubmit={startGlobalChat}
          autoFocus
          recipe={{ label: 'List recent todos', icon: <ListTodo size={15} />, prompt: 'List my action items and todos from recent meetings, grouped by meeting.' }}
        />
      </div>
    </>
  )
}

export function ChatView({ id, onNew }: { id: string; onNew: () => void }): ReactNode {
  const chat = useStore((s) => s.chats.find((c) => c.id === id))
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const body = useRef<HTMLDivElement>(null)

  // Answer whenever the thread ends with an unanswered question (including one started from Home).
  useEffect(() => {
    if (!chat || running.current) return
    const last = chat.messages[chat.messages.length - 1]
    if (!last || last.role !== 'user') return
    running.current = true
    setError(null)
    setAnswer('')
    const { notes, settings } = getState()
    const past = chat.messages.slice(0, -1)
    stream(
      { messages: globalChatMessages(notes, past, last.content, settings.userName, contextTokens(settings)), purpose: 'chat' },
      setAnswer
    )
      .promise.then((reply) => {
        const fresh = getState().chats.find((c) => c.id === id)
        if (fresh) saveChat({ ...fresh, updatedAt: Date.now(), messages: [...fresh.messages, { role: 'assistant', content: reply, at: Date.now() }] })
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        running.current = false
        setAnswer(null)
      })
  }, [chat, id])

  useEffect(() => {
    const el = body.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat?.messages.length, answer])

  if (!chat) {
    return (
      <>
        <Topbar />
        <div className="empty">This chat was deleted.</div>
      </>
    )
  }

  return (
    <>
      <Topbar
        left={
          <button className="icon-btn round" title="All chats" onClick={() => navigate({ name: 'chats' })}>
            <ChevronLeft size={16} />
          </button>
        }
        right={<NewNoteButton onNew={onNew} />}
      />
      <div className="scroll" ref={body}>
        <div className="column chat-thread">
          <h1 className="page-title" style={{ fontSize: 22 }}>
            {chat.title}
          </h1>
          <ChatThread messages={chat.messages} streaming={answer} error={error} />
        </div>
      </div>
      <div className="dock">
        <AskBar
          placeholder="Ask a follow-up"
          busy={answer !== null}
          autoFocus
          onSubmit={(q) =>
            saveChat({ ...chat, updatedAt: Date.now(), messages: [...chat.messages, { role: 'user', content: q, at: Date.now() }] })
          }
        />
      </div>
    </>
  )
}
