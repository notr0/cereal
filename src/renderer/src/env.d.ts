/// <reference types="vite/client" />
import type { CerealApi } from '../../preload'

declare global {
  interface Window {
    cereal: CerealApi
  }
}
