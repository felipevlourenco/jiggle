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
}): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Jiggle',
      submenu: [
        { role: 'about' },
        // Dev builds have no release feed to ask.
        { label: 'Check for Updates…', enabled: app.isPackaged, click: handlers.checkForUpdates },
        { type: 'separator' },
        { id: 'settings', label: 'Settings…', accelerator: 'Cmd+,', click: handlers.openSettings },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        todo('Save Layout…', 'Cmd+S'),
        todo('Export…', 'Cmd+E'),
        todo('Copy Layout to Another Device…')
      ]
    },
    {
      label: 'Edit',
      submenu: [
        todo('Undo', 'Cmd+Z'),
        todo('Redo', 'Shift+Cmd+Z'),
        { type: 'separator' },
        todo('Select All', 'Cmd+A'),
        todo('Find', 'Cmd+F')
      ]
    },
    {
      label: 'Device',
      submenu: [
        todo('Refresh', 'Cmd+R'),
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
