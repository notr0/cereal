import type { WebContents } from 'electron'
import type { LlmEvent, LlmRequest, LlmStatus } from '../shared/types'
import { claudeErrorMessage, claudeStatus, streamClaude } from './claude'
import { odysseusDefaultModel, store } from './store'

const controllers = new Map<string, AbortController>()
const trimUrl = (u: string): string => u.replace(/\/+$/, '')

async function ollamaStatus(baseUrl: string): Promise<LlmStatus> {
  try {
    const base = trimUrl(baseUrl)
    const [v, tags] = await Promise.all([
      fetch(`${base}/api/version`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
      fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json())
    ])
    return { provider: 'ollama', ok: true, version: v.version, models: (tags.models ?? []).map((m: { name: string }) => m.name) }
  } catch (e) {
    return { provider: 'ollama', ok: false, models: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function llmStatus(): Promise<LlmStatus> {
  const s = await store.getSettings()
  return s.llmProvider === 'claude' ? claudeStatus(s.claudeModel) : ollamaStatus(s.llmBaseUrl)
}

/**
 * Claude: the chosen Claude model. Ollama: the configured model, else Odysseus's default,
 * else the first installed model.
 */
export async function resolveModel(): Promise<string> {
  const s = await store.getSettings()
  if (s.llmProvider === 'claude') return s.claudeModel
  if (s.llmModel) return s.llmModel
  const fromOdysseus = await odysseusDefaultModel(s.odysseusDir)
  if (fromOdysseus) return fromOdysseus
  const status = await ollamaStatus(s.llmBaseUrl)
  if (status.models[0]) return status.models[0]
  throw new Error('No model configured and none found in Ollama')
}

async function postOllama(baseUrl: string, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  return fetch(`${trimUrl(baseUrl)}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
}

async function streamOllama(model: string, req: LlmRequest, signal: AbortSignal, onText: (delta: string) => void): Promise<void> {
  const s = await store.getSettings()
  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    stream: true,
    think: false,
    keep_alive: '30m',
    options: { num_ctx: s.numCtx, temperature: req.temperature ?? 0.3 }
  }
  let res = await postOllama(s.llmBaseUrl, body, signal)
  if (res.status === 400 && /think/i.test(await res.clone().text())) {
    // Models without a thinking mode reject the flag; retry without it.
    delete body.think
    res = await postOllama(s.llmBaseUrl, body, signal)
  }
  if (!res.ok || !res.body) throw new Error(`Ollama returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const chunk = JSON.parse(line)
      if (chunk.error) throw new Error(chunk.error)
      const delta = chunk.message?.content
      if (delta) onText(delta)
    }
  }
}

export async function streamChat(wc: WebContents, id: string, req: LlmRequest): Promise<void> {
  const send = (ev: LlmEvent): void => {
    if (!wc.isDestroyed()) wc.send('llm:event', ev)
  }
  const ac = new AbortController()
  controllers.set(id, ac)
  const s = await store.getSettings()
  const claude = s.llmProvider === 'claude'
  try {
    const model = await resolveModel()
    const onText = (delta: string): void => send({ id, type: 'delta', delta })
    if (claude) await streamClaude(model, req, ac.signal, onText)
    else await streamOllama(model, req, ac.signal, onText)
    send({ id, type: 'done' })
  } catch (e) {
    if (ac.signal.aborted) send({ id, type: 'aborted' })
    else send({ id, type: 'error', error: claude ? claudeErrorMessage(e) : e instanceof Error ? e.message : String(e) })
  } finally {
    controllers.delete(id)
  }
}

export function abortChat(id: string): void {
  controllers.get(id)?.abort()
}
