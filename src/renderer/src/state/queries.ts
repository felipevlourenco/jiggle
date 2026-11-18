import { useEffect, useState } from 'react'
import type { SidecarStatus } from '@shared/ipc-contract'
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

// A device's snapshots, or every device's when there is none (History works with nothing plugged in).
export const useSnapshots = (udid: string | undefined) =>
  useQuery({
    queryKey: ['snapshots', udid ?? 'all'],
    queryFn: () => window.jiggle.snapshots.list(udid)
  })

// The result comes back as a toast from main, so there is nothing to handle here.
export const useBackUp = () =>
  useMutation({ mutationFn: (udid: string) => window.jiggle.snapshots.backup(udid) })

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
  useEffect(
    () =>
      window.jiggle.snapshots.onChanged(
        () => void qc.invalidateQueries({ queryKey: ['snapshots'] })
      ),
    [qc]
  )
  // A changed region or lookup switch means the categories need another look.
  useEffect(
    () => window.jiggle.settings.onChanged(() => void qc.invalidateQueries({ queryKey: ['apps'] })),
    [qc]
  )
  // Categories arrive from the App Store in the background.
  useEffect(
    () => window.jiggle.apps.onChanged(() => void qc.invalidateQueries({ queryKey: ['apps'] })),
    [qc]
  )
}

// The device engine's state. When it comes back after a stop, everything is read again.
export function useSidecarStatus(): SidecarStatus {
  const qc = useQueryClient()
  const [status, setStatus] = useState<SidecarStatus>('ready')
  useEffect(() => {
    let last: SidecarStatus = 'ready'
    let heardEvent = false
    const apply = (next: SidecarStatus): void => {
      if (next === 'ready' && last !== 'ready' && last !== 'starting') void qc.invalidateQueries()
      last = next
      setStatus(next)
    }
    // The first answer may arrive after a newer event: the event wins.
    void window.jiggle.sidecar.status().then((first) => heardEvent || apply(first))
    return window.jiggle.sidecar.onStatus((next) => {
      heardEvent = true
      apply(next)
    })
  }, [qc])
  return status
}
