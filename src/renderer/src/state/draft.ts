import { useSyncExternalStore } from 'react'
import { commit, redo, startDraft, undo, type Draft } from '@shared/layout/edit'
import type { Layout } from '@shared/types'

// The home screen being edited by hand (M15): a draft of the phone's layout with undo and redo.
// Lives outside the screen so it survives switching tabs. `udid` says which phone it belongs to.
// ponytail: hand-rolled like the Organize choice; no store library for two small objects.
interface State {
  udid: string | null
  editing: boolean // icons jiggle and can be dragged
  draft: Draft | null
}

let state: State = { udid: null, editing: false, draft: null }
const listeners = new Set<() => void>()
const set = (next: State): void => {
  state = next
  listeners.forEach((l) => l())
}

export const draftActions = {
  // Start editing (Edit button): the draft begins as a copy of what the phone has.
  edit(udid: string, base: Layout): void {
    const keep = state.udid === udid && state.draft
    set({ udid, editing: true, draft: keep ? state.draft : startDraft(base) })
  },
  done: (): void => set({ ...state, editing: false }),
  // Throws the draft away (Discard, a push, a different phone, or the phone changed).
  reset: (): void => set({ udid: null, editing: false, draft: null }),
  change(next: Layout): void {
    if (state.draft) set({ ...state, draft: commit(state.draft, next) })
  },
  undo(): void {
    if (state.draft) set({ ...state, draft: undo(state.draft) })
  },
  redo(): void {
    if (state.draft) set({ ...state, draft: redo(state.draft) })
  }
}

export function useDraft(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state
  )
}
