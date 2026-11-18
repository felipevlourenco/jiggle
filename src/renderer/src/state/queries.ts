import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const useDevices = () =>
  useQuery({ queryKey: ['devices'], queryFn: () => window.jiggle.device.list() })

export const useLayout = (udid: string | undefined) =>
  useQuery({
    queryKey: ['layout', udid],
    queryFn: () => window.jiggle.layout.get(udid!),
    enabled: !!udid
  })

export const useApps = (udid: string | undefined) =>
  useQuery({
    queryKey: ['apps', udid],
    queryFn: () => window.jiggle.apps.list(udid!),
    enabled: !!udid
  })

// "Try Again": re-check one device now. A changed state also arrives as `device:changed`.
export function useRefreshDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (udid: string) => window.jiggle.device.refresh(udid),
    onSettled: () => qc.invalidateQueries({ queryKey: ['devices'] })
  })
}

// Main pushes `device:changed`; refetch everything that depends on the device.
export function useDeviceEvents(): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      window.jiggle.device.onChanged(() => {
        void qc.invalidateQueries({ queryKey: ['devices'] })
        void qc.invalidateQueries({ queryKey: ['layout'] })
        void qc.invalidateQueries({ queryKey: ['apps'] })
      }),
    [qc]
  )
  // Categories arrive from the App Store in the background.
  useEffect(
    () => window.jiggle.apps.onChanged(() => void qc.invalidateQueries({ queryKey: ['apps'] })),
    [qc]
  )
}
