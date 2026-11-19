import type { ExportService } from '../services/ExportService'
import { handle, type IpcLike } from './handle'

export function registerExportIpc(ipc: IpcLike, exporter: ExportService): void {
  handle(ipc, 'export:run', (request) => exporter.run(request))
  handle(ipc, 'export:reveal', (path) => exporter.reveal(path))
}
