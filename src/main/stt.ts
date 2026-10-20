import { store } from './store'

const trimUrl = (u: string): string => u.replace(/\/+$/, '')

/** Sends one WAV chunk to Odysseus or an OpenAI-compatible transcription server. */
export async function transcribeRemote(wav: ArrayBuffer): Promise<string> {
  const s = await store.getSettings()
  const form = new FormData()
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'chunk.wav')
  let url: string
  const headers: Record<string, string> = {}
  if (s.sttProvider === 'odysseus') {
    url = `${trimUrl(s.odysseusUrl)}/api/stt/transcribe`
    if (s.odysseusToken) headers.authorization = `Bearer ${s.odysseusToken}`
  } else {
    url = `${trimUrl(s.openaiSttUrl)}/audio/transcriptions`
    form.append('model', s.openaiSttModel)
    if (s.whisperLanguage) form.append('language', s.whisperLanguage)
  }
  const res = await fetch(url, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`Transcription server returned ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { text?: string }
  return json.text ?? ''
}
