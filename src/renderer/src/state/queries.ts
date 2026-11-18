import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export const useDevices = () =>
  useQuery({ queryKey: ['devices'], queryFn: () => window.jiggle.device.list() })

export const useLayout = (udid: string | undefined) =>
  useQuery({
    queryKey: ['layout', udid],
    queryFn: () => window.jiggle.layout.get(udid!),
    enabled: !!udid
  })

// Until the device switcher exists (M20), the active device is the first one.
export function useActiveDevice() {
  const { data } = useDevices()
  return data?.[0]
}

// Main pushes `device:changed`; refetch everything that depends on the device.
export function useDeviceEvents(): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      window.jiggle.device.onChanged(() => {
        void qc.invalidateQueries({ queryKey: ['devices'] })
        void qc.invalidateQueries({ queryKey: ['layout'] })
      }),
    [qc]
  )
}
