// `offline`: works with no device connected.
export const NAV_ITEMS: readonly { path: string; label: string; offline?: true }[] = [
  { path: '/home', label: 'Home Screen' },
  { path: '/apps', label: 'Apps' },
  { path: '/organize', label: 'Organize' },
  { path: '/history', label: 'History', offline: true },
  { path: '/cleanup', label: 'Cleanup' }
]
