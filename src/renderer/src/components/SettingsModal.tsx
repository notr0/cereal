import { useEffect, useState, type ReactNode } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { CLAUDE_MODELS } from '../../../shared/models'
import type { ClaudeKeyInfo, LlmProvider, Settings, SttProvider } from '../../../shared/types'
import { refreshLlm, setState, updateSettings, useStore } from '../lib/state'
import { Segmented, Toggle } from './Common'

const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-base', label: 'Whisper Base (fast, ~150 MB)' },
  { id: 'onnx-community/whisper-small', label: 'Whisper Small (balanced, ~500 MB)' },
  { id: 'onnx-community/whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo (best, needs GPU, ~1.6 GB)' }
]

const LANGUAGES = [
  ['', 'Auto-detect'],
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['nl', 'Dutch'],
  ['ko', 'Korean'],
  ['ja', 'Japanese'],
  ['zh', 'Chinese']
]

function Text({ k, placeholder, type = 'text' }: { k: keyof Settings; placeholder?: string; type?: string }): ReactNode {
  const value = useStore((s) => s.settings[k]) as string
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      className="input"
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && void updateSettings({ [k]: v.trim() } as Partial<Settings>)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function TestButton(): ReactNode {
  return (
    <button className="pill" onClick={() => void refreshLlm()} title="Test connection">
      <RefreshCw size={13} />
      Test
    </button>
  )
}

function ClaudeSettings(): ReactNode {
  const s = useStore((st) => st.settings)
  const llm = useStore((st) => st.llm)
  const [info, setInfo] = useState<ClaudeKeyInfo | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = (): void => void window.cereal.secrets.claudeKeyInfo().then(setInfo)
  useEffect(load, [])

  // The key is handed to the main process and never read back; only its last 4 characters are shown.
  const save = async (value: string | null): Promise<void> => {
    setBusy(true)
    setErr(null)
    try {
      await window.cereal.secrets.setClaudeKey(value)
      setKey('')
      load()
      await refreshLlm()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const status = llm?.provider === 'claude' ? llm : null
  return (
    <>
      <div className="field">
        <label>API key</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={key}
            placeholder={info?.saved ? `Saved key ending in ${info.hint}` : 'sk-ant-…'}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && key.trim()) void save(key)
            }}
          />
          {key.trim() ? (
            <button className="pill primary" disabled={busy} onClick={() => void save(key)}>
              Save
            </button>
          ) : (
            info?.saved && (
              <button className="pill" disabled={busy} onClick={() => void save(null)}>
                Remove
              </button>
            )
          )}
        </div>
        <div className="help">
          {err ??
            (info?.saved
              ? 'Stored encrypted with Windows secure storage.'
              : info?.fromEnv
                ? 'Using ANTHROPIC_API_KEY from your environment.'
                : 'Create one at console.anthropic.com. It is stored encrypted on this PC.')}
        </div>
      </div>
      <div className="field">
        <label>Model</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="select" value={s.claudeModel} onChange={(e) => void updateSettings({ claudeModel: e.target.value })}>
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.note}
              </option>
            ))}
          </select>
          <TestButton />
        </div>
        <div className="help">{status ? (status.ok ? 'Connected to the Claude API.' : status.error) : 'Checking…'}</div>
      </div>
    </>
  )
}

function OllamaSettings(): ReactNode {
  const s = useStore((st) => st.settings)
  const llm = useStore((st) => st.llm)
  const model = useStore((st) => st.model)
  const status = llm?.provider === 'ollama' ? llm : null
  return (
    <>
      <div className="field">
        <label>Ollama URL</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Text k="llmBaseUrl" placeholder="http://127.0.0.1:11434" />
          <TestButton />
        </div>
        <div className="help">
          {status
            ? status.ok
              ? `Connected · Ollama ${status.version} · ${status.models.length} models`
              : `Not reachable: ${status.error}`
            : 'Checking…'}
        </div>
      </div>
      <div className="field">
        <label>Model</label>
        <select className="select" value={s.llmModel} onChange={(e) => void updateSettings({ llmModel: e.target.value })}>
          <option value="">Same as Odysseus{!s.llmModel && model ? ` (${model})` : ''}</option>
          {status?.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Odysseus folder</label>
        <Text k="odysseusDir" placeholder="H:\odysseus" />
        <div className="help">Cereal reads Odysseus's default model from here.</div>
      </div>
      <div className="field">
        <label>Context size</label>
        <select className="select" value={s.numCtx} onChange={(e) => void updateSettings({ numCtx: Number(e.target.value) })}>
          {[8192, 16384, 32768, 65536].map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString()} tokens
            </option>
          ))}
        </select>
        <div className="help">Larger fits longer meetings but uses more GPU memory.</div>
      </div>
    </>
  )
}

export function SettingsModal(): ReactNode {
  const s = useStore((st) => st.settings)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const close = (): void => setState({ settingsOpen: false })

  useEffect(() => {
    void navigator.mediaDevices.enumerateDevices().then((d) => setMics(d.filter((x) => x.kind === 'audioinput')))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="scrim" onMouseDown={close}>
      <div className="popover modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <section className="settings-section" style={{ borderTop: 0, paddingTop: 0 }}>
            <h3>General</h3>
            <div className="field">
              <label>Appearance</label>
              <Segmented
                value={s.theme}
                onChange={(theme) => void updateSettings({ theme })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' }
                ]}
              />
            </div>
            <div className="field">
              <label>Your name</label>
              <Text k="userName" placeholder="Me" />
              <div className="help">Used for your side of the transcript.</div>
            </div>
          </section>

          <section className="settings-section">
            <h3>AI model</h3>
            <div className="field">
              <label>Provider</label>
              <Segmented<LlmProvider>
                value={s.llmProvider}
                onChange={(llmProvider) => void updateSettings({ llmProvider })}
                options={[
                  { value: 'ollama', label: 'Local (Ollama)' },
                  { value: 'claude', label: 'Claude API' }
                ]}
              />
              <div className="help">
                {s.llmProvider === 'claude'
                  ? 'Notes, transcripts and questions are sent to Anthropic. Transcription still runs on this PC.'
                  : 'Everything stays on this PC, using the Ollama instance Odysseus runs.'}
              </div>
            </div>
            {s.llmProvider === 'claude' ? <ClaudeSettings /> : <OllamaSettings />}
          </section>

          <section className="settings-section">
            <h3>Transcription</h3>
            <div className="field">
              <label>Engine</label>
              <Segmented<SttProvider>
                value={s.sttProvider}
                onChange={(sttProvider) => void updateSettings({ sttProvider })}
                options={[
                  { value: 'builtin', label: 'Built-in Whisper' },
                  { value: 'odysseus', label: 'Odysseus' },
                  { value: 'openai', label: 'OpenAI-compatible' }
                ]}
              />
            </div>
            {s.sttProvider === 'builtin' && (
              <div className="field">
                <label>Whisper model</label>
                <select className="select" value={s.whisperModel} onChange={(e) => void updateSettings({ whisperModel: e.target.value })}>
                  {WHISPER_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="help">Runs on your GPU inside Cereal. Downloaded once from Hugging Face.</div>
              </div>
            )}
            {s.sttProvider === 'odysseus' && (
              <>
                <div className="field">
                  <label>Odysseus URL</label>
                  <Text k="odysseusUrl" placeholder="http://127.0.0.1:7000" />
                </div>
                <div className="field">
                  <label>API token</label>
                  <Text k="odysseusToken" type="password" placeholder="ody_…" />
                  <div className="help">Turn on speech-to-text in Odysseus settings first (faster-whisper).</div>
                </div>
              </>
            )}
            {s.sttProvider === 'openai' && (
              <>
                <div className="field">
                  <label>Base URL</label>
                  <Text k="openaiSttUrl" placeholder="http://127.0.0.1:8000/v1" />
                </div>
                <div className="field">
                  <label>Model</label>
                  <Text k="openaiSttModel" placeholder="whisper-1" />
                </div>
              </>
            )}
            <div className="field">
              <label>Language</label>
              <select className="select" value={s.whisperLanguage} onChange={(e) => void updateSettings({ whisperLanguage: e.target.value })}>
                {LANGUAGES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="settings-section">
            <h3>Audio</h3>
            <div className="field">
              <label>Microphone</label>
              <select className="select" value={s.micDeviceId} onChange={(e) => void updateSettings({ micDeviceId: e.target.value })}>
                <option value="">System default</option>
                {mics
                  .filter((m) => m.deviceId && m.deviceId !== 'default' && m.deviceId !== 'communications')
                  .map((m) => (
                    <option key={m.deviceId} value={m.deviceId}>
                      {m.label || 'Microphone'}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label>Capture call audio</label>
              <Toggle on={s.captureSystemAudio} onChange={(captureSystemAudio) => void updateSettings({ captureSystemAudio })} />
              <div className="help">Transcribes what you hear (Zoom, Meet, Teams) as "Them". Headphones avoid echo.</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
