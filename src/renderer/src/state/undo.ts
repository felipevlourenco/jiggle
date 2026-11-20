import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { layoutSignature } from '@shared/layout/signature'
import { serialize } from '@shared/layout/serialize'
import type { SnapshotSummary } from '@shared/types'

// "Applied. Undo": offered for a moment after a change to the phone, for as long as the phone still shows
// what Jiggle wrote. Undo restores the backup taken just before. Lives outside the screens, like the draft.
export interface UndoOffer {
  udid: string
  backup: SnapshotSummary
  message: string
  written: string | null // signature of the layout the phone showed right after the change
}

let offer: UndoOffer | null = null
const listeners = new Set<() => void>()
const set = (next: UndoOffer | null): void => {
  offer = next
  listeners.forEach((l) => l())
}

export const signatureOf = (layout: Parameters<typeof serialize>[0]): string =>
  layoutSignature(serialize(layout))

export async function offerUndo(
  qc: QueryClient,
  udid: string,
  backup: SnapshotSummary,
  message: string
): Promise<void> {
  // The sheet has just asked for a fresh read of the phone; take it as what Jiggle wrote.
  const read = await qc
    .fetchQuery({
      queryKey: ['layout', udid],
      queryFn: () => window.jiggle.layout.get(udid),
      staleTime: 0
    })
    .catch(() => null)
  set({ udid, backup, message, written: read ? signatureOf(read.layout) : null })
}
export const clearUndo = (): void => set(null)

export function useUndoOffer(): UndoOffer | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => offer
  )
}
