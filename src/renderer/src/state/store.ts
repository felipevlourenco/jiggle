import { useSyncExternalStore } from 'react'
import { COLOR_FAMILIES, DEFAULT_COLOR_ORDER, type ColorFamily } from '@shared/layout/color'
import type { FolderRule } from '@shared/layout/folders'
import type { SortOptions } from '@shared/layout/sort'

// What the Organize screen has chosen. Lives outside the screen so it survives switching tabs.
// ponytail: a hand-rolled store for one object; move to a library when pins and folders (M16–M17) add more.
export interface OrganizeChoice {
  by: SortOptions['by']
  widgetMode: SortOptions['widgetMode']
  folders: FolderRule | null // one folder per category, developer or first letter; null: no folders
  colorOrder: readonly ColorFamily[] // with by: 'color'; kept across launches
  perPage: boolean // each color or category starts on a new page, where canSortPerPage allows it
}

const COLOR_KEY = 'jiggle.colorOrder'
function savedColorOrder(): readonly ColorFamily[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLOR_KEY) ?? 'null') as unknown
    // Only a complete list of known families counts; anything else is the default.
    if (
      Array.isArray(saved) &&
      saved.length === COLOR_FAMILIES.length &&
      COLOR_FAMILIES.every((f) => saved.includes(f))
    ) {
      return saved as ColorFamily[]
    }
  } catch {
    // no storage: the default
  }
  return DEFAULT_COLOR_ORDER
}

let choice: OrganizeChoice = {
  by: 'name',
  widgetMode: 'keep-pages',
  folders: null,
  perPage: false,
  colorOrder: savedColorOrder()
}
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
      if (patch.colorOrder) {
        try {
          localStorage.setItem(COLOR_KEY, JSON.stringify(patch.colorOrder))
        } catch {
          // not saved: it lasts until the app closes
        }
      }
      listeners.forEach((l) => l())
    }
  ]
}
