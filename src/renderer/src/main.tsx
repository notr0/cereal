import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/ibm-plex-serif/400.css'
import '@fontsource/ibm-plex-serif/500.css'
import '@fontsource/ibm-plex-serif/600.css'
import '@fontsource-variable/jetbrains-mono'
import './styles.css'
import { App } from './App'
import { finishBeforeQuit } from './lib/session'
import { init } from './lib/state'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)

void init()
window.cereal.app.onPrepareQuit(finishBeforeQuit)
