import { app, Menu, type MenuItemConstructorOptions } from 'electron'

// Items not built yet are disabled; they get enabled in the milestone that builds them.
const todo = (label: string, accelerator?: string): MenuItemConstructorOptions => ({
  label,
  accelerator,
  enabled: false
})

export function buildMenu(handlers: {
  backUpNow: () => void
  restoreLast: () => void
  openSettings: () => void
  checkForUpdates: () => void
  refresh: () => void
  saveLayout: () => void
  exportLayout: () => void
  copyLayout: () => void
}): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Jiggle',
      submenu: [
        { role: 'about' },
        // Dev builds have no release feed to ask.
        { label: 'Check for Updates…', enabled: app.isPackaged, click: handlers.checkForUpdates },
        { type: 'separator' },
        {
          id: 'settings',
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: handlers.openSettings
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          id: 'save-layout',
          label: 'Save Layout…',
          accelerator: 'CmdOrCtrl+S',
          click: handlers.saveLayout
        },
        {
          id: 'export',
          label: 'Export…',
          accelerator: 'CmdOrCtrl+E',
          click: handlers.exportLayout
        },
        {
          id: 'copy-layout',
          label: 'Copy Layout to Another Device…',
          click: handlers.copyLayout
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        todo('Undo'),
        todo('Redo'),
        { type: 'separator' },
        // A Mac only runs ⌘X, ⌘C and ⌘V in text fields when the menu has these.
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        todo('Select All', 'CmdOrCtrl+A'),
        todo('Find', 'CmdOrCtrl+F')
      ]
    },
    {
      label: 'Device',
      submenu: [
        { id: 'refresh', label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: handlers.refresh },
        { id: 'backup', label: 'Back Up Now', click: handlers.backUpNow },
        { id: 'restore-last', label: 'Restore Last Backup…', click: handlers.restoreLast }
      ]
    },
    {
      label: 'View',
      submenu: [
        todo('Toggle Sidebar'),
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        ...(app.isPackaged
          ? []
          : ([{ type: 'separator' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[]))
      ]
    },
    { role: 'windowMenu' },
    { role: 'help', submenu: [todo('Jiggle Help')] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
