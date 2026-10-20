export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'Recommended' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'Faster, cheaper' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'Fastest, cheapest' },
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', note: 'Most capable, priciest' }
] as const

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5'

export const claudeModelName = (id: string): string => CLAUDE_MODELS.find((m) => m.id === id)?.name ?? id
