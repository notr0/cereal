import { useSyncExternalStore } from 'react'
import type { Speaker, TranscriptEntry } from '../../../shared/types'
import { Recorder } from './recorder'
import { flushSaves, getNote, getState, updateNote } from './state'
import { cleanTranscript, transcriber } from './transcriber'
import { jaccard, uid } from './util'

export type RecStatus = 'idle' | 'starting' | 'recording' | 'paused'

export interface SessionState {
  noteId: string | null
  status: RecStatus
  since: number
  baseMs: number
  system: boolean
  sttStatus: string | null
  error: string | null
  pending: number
}

let snap: SessionState = {
  noteId: null,
  status: 'idle',
  since: 0,
  baseMs: 0,
  system: false,
  sttStatus: null,
  error: null,
  pending: 0
}
const listeners = new Set<() => void>()
const set = (p: Partial<SessionState>): void => {
  snap = { ...snap, ...p }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useSession = (): SessionState => useSyncExternalStore(subscribe, () => snap)
export const getSession = (): SessionState => snap
export const clearSessionError = (): void => set({ error: null })

let recorder: Recorder | null = null
/** The recorder whose mic is still opening; cleared when it starts or is cancelled. */
let starting: Recorder | null = null
transcriber.onStatus = (sttStatus) => set({ sttStatus })

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function elapsedMs(): number {
  return snap.baseMs + (snap.status === 'recording' ? Date.now() - snap.since : 0)
}

/** Resolves once queued audio has been transcribed (or after a timeout). */
export function whenTranscribed(timeoutMs = 90_000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve) => {
    const check = (): void => {
      if (snap.pending === 0 || Date.now() - start > timeoutMs) resolve()
      else setTimeout(check, 250)
    }
    check()
  })
}

export function currentLevel(): number {
  return recorder ? Math.max(recorder.level.me, recorder.level.them) : 0
}

/** Speakers bleed into the mic; drop a line that repeats what the other side just said. */
function isEcho(entries: TranscriptEntry[], speaker: Speaker, text: string, at: number): boolean {
  return entries.some((e) => e.speaker !== speaker && Math.abs(at - e.at) < 30_000 && jaccard(e.text, text) > 0.5)
}

async function onSegment(noteId: string, speaker: Speaker, audio: Float32Array): Promise<void> {
  const at = Date.now()
  const seconds = audio.length / 16000
  set({ pending: snap.pending + 1 })
  try {
    const text = cleanTranscript(await transcriber.transcribe(audio), seconds)
    const note = getNote(noteId)
    if (!text || !note) return
    if (speaker === 'me' && isEcho(note.transcript, 'me', text, at)) return
    updateNote(noteId, (n) => {
      // When the system-audio copy arrives after the mic copy, keep the system one.
      const kept =
        speaker === 'them'
          ? n.transcript.filter((e) => !(e.speaker === 'me' && Math.abs(at - e.at) < 30_000 && jaccard(e.text, text) > 0.5))
          : n.transcript
      return { transcript: [...kept, { id: uid(), speaker, text, at }] }
    })
  } catch (e) {
    set({ error: `Transcription failed: ${message(e)}` })
  } finally {
    set({ pending: snap.pending - 1 })
  }
}

export async function startRecording(noteId: string): Promise<void> {
  if (snap.noteId === noteId && snap.status !== 'idle') {
    if (snap.status === 'paused') await resumeRecording()
    return
  }
  if (snap.noteId) await stopRecording()
  const note = getNote(noteId)
  if (!note) return
  const settings = getState().settings
  set({ noteId, status: 'starting', error: null, baseMs: note.recordedMs })
  const rec = new Recorder((speaker, audio) => void onSegment(noteId, speaker, audio))
  starting = rec
  try {
    const { system } = await rec.start({ micDeviceId: settings.micDeviceId, system: settings.captureSystemAudio })
    if (starting !== rec) {
      // Stopped, or another note started, while the mic was still opening.
      await rec.stop()
      return
    }
    starting = null
    recorder = rec
    set({ status: 'recording', since: Date.now(), system })
    transcriber.warmup()
  } catch (e) {
    await rec.stop().catch(() => undefined)
    if (starting !== rec) return
    starting = null
    set({ status: 'idle', noteId: null, error: `Couldn't start recording: ${message(e)}` })
  }
}

export async function pauseRecording(): Promise<void> {
  if (snap.status !== 'recording' || !recorder || !snap.noteId) return
  const ms = elapsedMs()
  await recorder.pause()
  set({ status: 'paused', baseMs: ms })
  updateNote(snap.noteId, { recordedMs: ms })
}

export async function resumeRecording(): Promise<void> {
  if (snap.status !== 'paused' || !recorder) return
  await recorder.resume()
  set({ status: 'recording', since: Date.now() })
}

export async function stopRecording(): Promise<void> {
  const id = snap.noteId
  const ms = elapsedMs()
  const rec = recorder
  recorder = null
  starting = null
  set({ status: 'idle', noteId: null, since: 0 })
  if (rec) await rec.stop()
  if (id && getNote(id)) updateNote(id, { recordedMs: ms })
}

/** Before Cereal exits: stop the mic, transcribe what was already heard, and save everything. */
export async function finishBeforeQuit(): Promise<void> {
  if (snap.noteId) await stopRecording()
  await whenTranscribed(15_000)
  await flushSaves()
}
