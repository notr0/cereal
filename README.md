# Cereal

Local-first AI meeting notes for Windows. Write rough notes during a call, let Cereal transcribe
you and the other side, then generate clean, organized notes and ask questions about them.

The interface follows Granola's design language (warm neutrals, olive accent, serif titles,
floating "Ask anything" bar). All code is original; no Granola code, assets or fonts are used.

## What it does

- **Live transcription** of your mic ("Me") and call audio ("Them") with Whisper running on your
  GPU inside the app. Optional: Odysseus's speech-to-text or any OpenAI-compatible server.
- **Generate notes** from your notes plus the transcript, with templates (general meeting, 1:1,
  stand-up, customer call, interview, brainstorm, lecture). Your own points stay in full ink;
  AI additions are gray.
- **Ask anything** about one meeting or across all of them.
- **Spaces** to organize notes, Ctrl+K search, light and dark themes.

## AI providers

| Provider | Where it runs | Setup |
|---|---|---|
| Local (Ollama) | This PC, through the Ollama instance Odysseus uses | Default. Uses Odysseus's default model unless you pick another |
| Claude API | Anthropic | Settings → AI model → Claude API, paste your key from console.anthropic.com |

The Claude API key is stored encrypted with Windows secure storage in your user profile. It is
never written to this repository. Transcription always runs locally.

## Requirements

- Windows 10 or 11
- Node.js 22.19+ or 24.11+
- Ollama for local AI (`http://127.0.0.1:11434` by default)

## Develop

```bash
npm install
npm run dev
```

`npm install` also downloads the Electron binary. Other scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Run with hot reload |
| `npm run build` | Build into `out/` |
| `npm start` | Run the last build |
| `npm run dist` | Package an unpacked Windows app into `dist/win-unpacked/Cereal.exe` |

Keep the project in a short path (for example `H:\cereal`). Chromium cannot load files whose full
path exceeds Windows' 260-character limit.

## Where data lives

`%APPDATA%\Cereal\data`: one JSON file per note and chat, plus `settings.json`, `folders.json` and
the encrypted `secrets.json`. The Whisper model is cached by the app after its first download.

## Layout

```
src/main/       Electron main process: window, storage, Ollama and Claude clients, remote STT
src/preload/    The window.cereal bridge exposed to the UI
src/renderer/   React UI, audio capture, Whisper worker, prompts and templates
src/shared/     Types and model list shared by both sides
scripts/        Build helpers
```
