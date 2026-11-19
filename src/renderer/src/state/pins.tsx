import {
  createContext,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode
} from 'react'
import { NO_PINS, toggleAppPin } from '@shared/layout/pins'
import type { Pins } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PinIcon } from '../components/icons'
import s from './pins.module.css'

interface PinsApi {
  pins: Pins
  setPage1(on: boolean): void
  // Right-click handler: opens the Pin / Unpin menu for this app.
  openMenu(e: MouseEvent, app: { bundleId: string; name: string }): void
}
const PinsContext = createContext<PinsApi>({ pins: NO_PINS, setPage1() {}, openMenu() {} })
export const usePins = (): PinsApi => useContext(PinsContext)

// A device's pins, plus the right-click menu every app tile and row shares.
export function PinsProvider({
  udid,
  children
}: {
  udid: string | undefined
  children: ReactNode
}) {
  const qc = useQueryClient()
  const key = ['pins', udid]
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => window.jiggle.pins.get(udid!),
    enabled: !!udid
  })
  const pins = data ?? NO_PINS
  const save = useMutation({
    mutationFn: (next: Pins) => window.jiggle.pins.set(udid!, next),
    onMutate: (next) => qc.setQueryData(key, next)
  })
  const [menu, setMenu] = useState<{ x: number; y: number; bundleId: string; name: string }>()
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(undefined)
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', esc)
    }
  }, [menu])

  const api: PinsApi = {
    pins,
    setPage1: (on) => udid && save.mutate({ ...pins, page1: on }),
    openMenu: (e, app) => {
      if (!udid) return
      e.preventDefault()
      setMenu({ x: e.clientX, y: e.clientY, ...app })
    }
  }
  return (
    <PinsContext.Provider value={api}>
      {children}
      {menu && (
        <div className={s.menu} style={{ left: menu.x, top: menu.y }} role="menu">
          <button
            role="menuitem"
            autoFocus
            onClick={() => save.mutate(toggleAppPin(pins, menu.bundleId))}
          >
            <PinIcon size={14} />
            {pins.apps.includes(menu.bundleId) ? 'Unpin' : 'Pin'} {menu.name}
          </button>
        </div>
      )}
    </PinsContext.Provider>
  )
}
