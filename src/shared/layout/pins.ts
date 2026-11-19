import type { Pins } from '../types'

export const NO_PINS: Pins = { apps: [], page1: false }

export const toggleAppPin = (pins: Pins, bundleId: string): Pins => ({
  ...pins,
  apps: pins.apps.includes(bundleId)
    ? pins.apps.filter((id) => id !== bundleId)
    : [...pins.apps, bundleId]
})
