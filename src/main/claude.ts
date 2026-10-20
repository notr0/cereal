import Anthropic from '@anthropic-ai/sdk'
import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { CLAUDE_MODELS } from '../shared/models'
import type { ClaudeKeyInfo, LlmRequest, LlmStatus } from '../shared/types'

// ── API key, encrypted at rest with the OS keystore (DPAPI on Windows) ──

const secretsFile = (): string => join(app.getPath('userData'), 'data', 'secrets.json')

async function readSecrets(): Promise<{ claudeKey?: string }> {
  try {
    return JSON.parse(await fs.readFile(secretsFile(), 'utf8'))
  } catch {
    return {}
  }
}

async function getClaudeKey(): Promise<string | null> {
  const { claudeKey } = await readSecrets()
  if (!claudeKey) return null
  try {
    return safeStorage.decryptString(Buffer.from(claudeKey, 'base64'))
  } catch {
    return null
  }
}

let client: Anthropic | null = null
let usingSavedKey = false

export async function setClaudeKey(key: string | null): Promise<void> {
  await fs.mkdir(dirname(secretsFile()), { recursive: true })
  client = null
  const trimmed = key?.trim()
  if (!trimmed) {
    await fs.writeFile(secretsFile(), '{}')
    return
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system.')
  const claudeKey = safeStorage.encryptString(trimmed).toString('base64')
  await fs.writeFile(secretsFile(), JSON.stringify({ claudeKey }))
}

export async function claudeKeyInfo(): Promise<ClaudeKeyInfo> {
  const key = await getClaudeKey()
  return { saved: !!key, hint: key ? key.slice(-4) : null, fromEnv: !!process.env.ANTHROPIC_API_KEY }
}

/** Uses the saved key, otherwise the SDK's own lookup (ANTHROPIC_API_KEY or an `ant auth login` profile). */
async function getClient(): Promise<Anthropic> {
  if (client) return client
  const apiKey = await getClaudeKey()
  usingSavedKey = !!apiKey
  client = apiKey ? new Anthropic({ apiKey }) : new Anthropic()
  return client
}

// ── requests ──

const EFFORT = { notes: 'medium', chat: 'low', title: 'low' } as const

export function claudeErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude rejected the API key. Check it in Settings.'
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key can't use the selected Claude model."
  if (e instanceof Anthropic.NotFoundError) return 'That Claude model was not found. Pick another one in Settings.'
  if (e instanceof Anthropic.RateLimitError) return 'Claude rate limit reached. Try again in a moment.'
  if (e instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${e.message}`
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API. Check your internet connection."
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ''}: ${e.message}`
  // Without a saved key the SDK fails before any request when it finds no other credentials.
  if (!usingSavedKey) return 'No Claude API key yet. Add one in Settings.'
  return e instanceof Error ? e.message : String(e)
}

export async function claudeStatus(model: string): Promise<LlmStatus> {
  const models = CLAUDE_MODELS.map((m) => m.id)
  try {
    await (await getClient()).models.retrieve(model, {}, { timeout: 10_000 })
    return { provider: 'claude', ok: true, version: 'Claude API', models }
  } catch (e) {
    return { provider: 'claude', ok: false, models, error: claudeErrorMessage(e) }
  }
}

export async function streamClaude(
  model: string,
  req: LlmRequest,
  signal: AbortSignal,
  onText: (delta: string) => void
): Promise<void> {
  const c = await getClient()
  const system = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const messages: Anthropic.Beta.BetaMessageParam[] = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  // If a safety classifier declines a benign request, let the API retry it on its recommended
  // fallback model instead of failing. Haiku has no server-side fallback.
  const fallback = model.startsWith('claude-haiku')
    ? {}
    : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
  const stream = c.beta.messages.stream(
    {
      model,
      max_tokens: 64000,
      ...(system ? { system } : {}),
      messages,
      cache_control: { type: 'ephemeral' },
      output_config: { effort: EFFORT[req.purpose ?? 'chat'] },
      ...fallback
    },
    { signal }
  )
  stream.on('text', onText)
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') {
    const category = final.stop_details?.category
    throw new Error(`Claude declined this request${category ? ` (${category})` : ''}.`)
  }
}
