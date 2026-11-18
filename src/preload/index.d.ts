import type { JiggleApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    jiggle: JiggleApi
  }
}
