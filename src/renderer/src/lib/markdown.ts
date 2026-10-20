import { Marked } from 'marked'
import { words } from './util'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const md = new Marked({ gfm: true, breaks: false })
// Model output is untrusted: render any raw HTML it emits as text.
md.use({ renderer: { html: ({ text }) => escapeHtml(text) } })

export function mdToHtml(src: string): string {
  return md.parse(src, { async: false }) as string
}

const BLOCK = new Set(['UL', 'OL', 'P', 'PRE', 'BLOCKQUOTE', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

const stem = (w: string): string => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)
const tokens = (s: string): string[] => words(s).map(stem)

/**
 * Converts enhanced-notes Markdown to editor HTML. Like Granola, text the AI wrote is
 * wrapped in <span data-ai> (rendered gray) while the user's own points stay in full ink.
 * Each line the user typed claims at most one block: the one that covers its words best.
 */
export function enhancedHtml(markdown: string, userNotesText: string): string {
  const doc = new DOMParser().parseFromString(`<div>${mdToHtml(markdown)}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement
  const blocks: { el: Element; inline: ChildNode[]; tokens: Set<string> }[] = []
  root.querySelectorAll('p, li').forEach((el) => {
    const inline = Array.from(el.childNodes).filter((n) => !(n instanceof Element && BLOCK.has(n.tagName)))
    const text = inline.map((n) => n.textContent ?? '').join('')
    if (text.trim()) blocks.push({ el, inline, tokens: new Set(tokens(text)) })
  })

  const owned = new Set<number>()
  for (const line of userNotesText.split('\n').map(tokens)) {
    if (line.length < 2) continue
    let best = -1
    let bestScore = 0
    blocks.forEach((b, i) => {
      const score = line.filter((w) => b.tokens.has(w)).length / line.length
      if (score > bestScore) {
        best = i
        bestScore = score
      }
    })
    if (best >= 0 && bestScore >= 0.6) owned.add(best)
  }

  blocks.forEach((b, i) => {
    if (owned.has(i)) return
    const span = doc.createElement('span')
    span.setAttribute('data-ai', '')
    b.el.insertBefore(span, b.inline[0])
    b.inline.forEach((n) => span.appendChild(n))
  })
  return root.innerHTML
}
