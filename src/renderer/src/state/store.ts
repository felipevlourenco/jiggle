import { useSyncExternalStore } from 'react'
import {
  COLOR_FAMILIES,
  DEFAULT_COLOR_ORDER,
  defaultJoins,
  type ColorFamily
} from '@shared/layout/color'
import type { FolderRule } from '@shared/layout/folders'
import type { SortOptions } from '@shared/layout/sort'

// What the Organize screen has chosen. Lives outside the screen so it survives switching tabs.
// ponytail: a hand-rolled store for one object; move to a library when pins and folders (M16–M17) add more.
export interface OrganizeChoice {
  by: SortOptions['by']
  widgetMode: SortOptions['widgetMode']
  folders: FolderRule | null // one folder per category, developer or first letter; null: no folders
  colorOrder: readonly ColorFamily[] // with by: 'color'; kept across launches
  colorJoins: readonly ColorFamily[] // colors sharing a page with the one before them; kept too
  perPage: boolean // each color or category starts on a new page, where canSortPerPage allows it
}

const COLOR_KEY = 'jiggle.colorOrder'
const JOINS_KEY = 'jiggle.colorJoins'

// A saved list of known color families; anything else, or no storage, is null.
function savedFamilies(key: string): ColorFamily[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
    if (Array.isArray(saved) && saved.every((f) => COLOR_FAMILIES.includes(f as ColorFamily))) {
      return saved as ColorFamily[]
    }
  } catch {
    // unreadable: the default
  }
  return null
}

function save(key: string, families: readonly ColorFamily[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(families))
  } catch {
    // not saved: it lasts until the app closes
  }
}

// Only a complete order counts.
const savedOrder = savedFamilies(COLOR_KEY)
const startOrder =
  savedOrder && COLOR_FAMILIES.every((f) => savedOrder.includes(f))
    ? savedOrder
    : DEFAULT_COLOR_ORDER

let choice: OrganizeChoice = {
  by: 'name',
  widgetMode: 'keep-pages',
  folders: null,
  perPage: false,
  colorOrder: startOrder,
  colorJoins: savedFamilies(JOINS_KEY) ?? defaultJoins(startOrder)
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
      if (patch.colorOrder) save(COLOR_KEY, patch.colorOrder)
      if (patch.colorJoins) save(JOINS_KEY, patch.colorJoins)
      listeners.forEach((l) => l())
    }
  ]
}
