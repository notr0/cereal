import type { ChatMessage, LlmMessage, Note, TranscriptEntry } from '../../../shared/types'
import type { Template } from './templates'
import { htmlToText } from './util'

/** Rough characters-per-token for budgeting against the model's context window. */
const CHARS_PER_TOKEN = 3.2

export function budgetChars(numCtx: number, reserveTokens = 2500): number {
  return Math.max(4000, Math.floor((numCtx - reserveTokens) * CHARS_PER_TOKEN))
}

export function transcriptText(entries: TranscriptEntry[], userName: string, budget: number): string {
  const label = (e: TranscriptEntry): string => (e.speaker === 'me' ? userName || 'Me' : 'Them')
  const lines = entries.map((e) => `${label(e)}: ${e.text}`)
  const full = lines.join('\n')
  if (full.length <= budget) return full
  // Keep the opening and the end of long meetings, where context and decisions usually are.
  const head = full.slice(0, Math.floor(budget * 0.35))
  const tail = full.slice(full.length - Math.floor(budget * 0.65))
  return `${head}\n[… middle of transcript omitted for length …]\n${tail}`
}

const today = (t: number): string =>
  new Date(t).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export function enhanceMessages(note: Note, template: Template, userName: string, numCtx: number): LlmMessage[] {
  const system = `You are Cereal, an expert meeting note-taker. You turn the rough notes someone typed during a meeting, plus the meeting transcript, into clean, well-organized meeting notes.

Rules:
- Output Markdown only: "### " section headings with "- " bullets under them (nest sub-points with two spaces). No title, no preamble, no closing remarks.
- The user's own notes are the backbone. Keep every point they wrote, keep their wording where you can, and enrich each one with specifics from the transcript: names, numbers, dates, decisions, reasons.
- Add other important points from the transcript that the user did not write down.
- Be concise. Short bullets, no filler, nothing speculative. Only include what the notes or transcript support.
- In the transcript, "${userName || 'Me'}" is the user and "Them" is everyone else on the call. Refer to people by name when the transcript makes names clear.
- Transcripts come from speech recognition and contain errors; fix obvious mis-hearings silently.

Template: ${template.name}
${template.instructions}
Skip any section that would be empty.`

  const myNotes = htmlToText(note.myNotes)
  const transcript = transcriptText(note.transcript, userName, budgetChars(numCtx, 3500) - myNotes.length)
  const user = `Meeting title: ${note.title || 'Untitled'}
Date: ${today(note.createdAt)}

<my_notes>
${myNotes || '(none)'}
</my_notes>

<transcript>
${transcript || '(no transcript)'}
</transcript>

Write the meeting notes now.`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

export function titleMessages(note: Note, userName: string): LlmMessage[] {
  const material = [htmlToText(note.myNotes), transcriptText(note.transcript, userName, 5000)].join('\n').slice(0, 6000)
  return [
    {
      role: 'system',
      content: 'You write short, specific titles for meeting notes. Reply with the title only: at most 7 words, no quotes, no trailing period.'
    },
    { role: 'user', content: material }
  ]
}

function noteContext(note: Note, userName: string, budget: number): string {
  const notes = note.enhanced ? htmlToText(note.enhanced) : htmlToText(note.myNotes)
  const transcript = transcriptText(note.transcript, userName, Math.max(1000, budget - notes.length))
  return `Meeting: ${note.title || 'Untitled'} (${today(note.createdAt)})

<notes>
${notes || '(none)'}
</notes>

<transcript>
${transcript || '(no transcript)'}
</transcript>`
}

const history = (msgs: ChatMessage[]): LlmMessage[] =>
  msgs.slice(-12).map((m) => ({ role: m.role, content: m.content }))

export function noteChatMessages(note: Note, past: ChatMessage[], question: string, userName: string, numCtx: number): LlmMessage[] {
  return [
    {
      role: 'system',
      content: `You are Cereal, a helpful assistant answering questions about one meeting. Use the notes and transcript below. Be direct and concise; use Markdown bullets for lists. If the meeting doesn't contain the answer, say so plainly. The user is "${userName || 'Me'}"; "Them" is everyone else.

${noteContext(note, userName, budgetChars(numCtx, 4000))}`
    },
    ...history(past),
    { role: 'user', content: question }
  ]
}

export function globalChatMessages(notes: Note[], past: ChatMessage[], question: string, userName: string, numCtx: number): LlmMessage[] {
  let budget = budgetChars(numCtx, 4000)
  const parts: string[] = []
  for (const n of [...notes].sort((a, b) => b.createdAt - a.createdAt)) {
    const body = n.enhanced ? htmlToText(n.enhanced) : htmlToText(n.myNotes) || transcriptText(n.transcript, userName, 1500)
    const block = `## ${n.title || 'Untitled'} (${today(n.createdAt)})\n${body || '(empty)'}`
    if (block.length > budget) break
    parts.push(block)
    budget -= block.length
  }
  return [
    {
      role: 'system',
      content: `You are Cereal, a helpful assistant with access to the user's meeting notes, newest first. Answer using them; mention which meeting a fact came from when useful. Be direct and concise; use Markdown bullets for lists. If the notes don't contain the answer, say so. Today is ${today(Date.now())}.

${parts.join('\n\n') || '(The user has no notes yet.)'}`
    },
    ...history(past),
    { role: 'user', content: question }
  ]
}
