import { z } from 'zod'
import {
  channels,
  type ChannelArgs,
  type ChannelName,
  type ChannelResult
} from '@shared/ipc-contract'

// The part of Electron's ipcMain we use, so tests can pass a fake.
export interface IpcLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

// Registers a handler whose arguments are validated against the contract first.
// A malformed call rejects in the renderer with a readable message and never reaches `fn`.
export function handle<C extends ChannelName>(
  ipc: IpcLike,
  channel: C,
  fn: (...args: ChannelArgs<C>) => ChannelResult<C> | Promise<ChannelResult<C>>
): void {
  ipc.handle(channel, (_event, ...raw) => {
    const parsed = channels[channel].args.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Invalid arguments for ${channel}: ${z.prettifyError(parsed.error)}`)
    }
    return fn(...(parsed.data as ChannelArgs<C>))
  })
}
