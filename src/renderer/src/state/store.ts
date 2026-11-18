import { useSyncExternalStore } from 'react'
import type { SortOptions } from '@shared/layout/sort'

// What the Organize screen has chosen. Lives outside the screen so it survives switching tabs.
// ponytail: a hand-rolled store for one object; move to a library when pins and folders (M16–M17) add more.
export interface OrganizeChoice {
  by: SortOptions['by']
  widgetMode: SortOptions['widgetMode']
}

let choice: OrganizeChoice = { by: 'name', widgetMode: 'keep-pages' }
const listeners = new Set<() => void>()

export function useOrganizeChoice(): [OrganizeChoice, (patch: Partial<OrganizeChoice>) => void] {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => choice
  )
  return [
    current,
    (patch) => {
      choice = { ...choice, ...patch }
      listeners.forEach((l) => l())
    }
  ]
}
