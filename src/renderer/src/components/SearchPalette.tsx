import { useMemo, useState, type ReactNode } from 'react'
import { FileText } from 'lucide-react'
import { navigate, setState, useStore } from '../lib/state'
import { dayLabel, htmlToText } from '../lib/util'

export function SearchPalette(): ReactNode {
  const notes = useStore((s) => s.notes)
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(0)
  const close = (): void => setState({ searchOpen: false })

  const index = useMemo(
    () =>
      notes.map((n) => ({
        note: n,
        text: [htmlToText(n.enhanced ?? ''), htmlToText(n.myNotes), n.transcript.map((t) => t.text).join(' ')].join('\n')
      })),
    [notes]
  )

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const sorted = [...index].sort((a, b) => b.note.createdAt - a.note.createdAt)
    if (!needle) return sorted.slice(0, 8).map((r) => ({ ...r, snippet: '' }))
    return sorted
      .filter((r) => r.note.title.toLowerCase().includes(needle) || r.text.toLowerCase().includes(needle))
      .slice(0, 20)
      .map((r) => {
        const at = r.text.toLowerCase().indexOf(needle)
        const snippet = at < 0 ? '' : (at > 30 ? '…' : '') + r.text.slice(Math.max(0, at - 30), at + 80).replace(/\s+/g, ' ')
        return { ...r, snippet }
      })
  }, [q, index])

  const open = (id: string): void => navigate({ name: 'note', id })

  return (
    <div className="scrim" onMouseDown={close}>
      <div className="popover search" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Search notes and transcripts"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setFocus(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setFocus((f) => Math.min(results.length - 1, f + 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setFocus((f) => Math.max(0, f - 1))
            }
            if (e.key === 'Enter' && results[focus]) open(results[focus].note.id)
          }}
        />
        <div className="search-results">
          {results.length === 0 && <div className="menu-label" style={{ padding: 12 }}>No matches</div>}
          {!q && results.length > 0 && <div className="menu-label">Recent</div>}
          {results.map((r, i) => (
            <button
              key={r.note.id}
              className={`menu-item ${i === focus ? 'focused' : ''}`}
              onMouseEnter={() => setFocus(i)}
              onClick={() => open(r.note.id)}
            >
              <FileText size={15} color="var(--ink-2)" />
              <span style={{ minWidth: 0, flex: 1 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note.title || 'Untitled note'}</div>
                {r.snippet && <div className="snippet">{r.snippet}</div>}
              </span>
              <span className="time">{dayLabel(r.note.createdAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
