import { readFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { channels } from '@shared/ipc-contract'
import { NO_PINS } from '@shared/layout/pins'
import type { Pins } from '@shared/types'
import type { Logger } from './bridge/SidecarBridge'
import { isSafeUdid, pinsPath } from './storage/paths'

// What a sort must leave in place, one `pins.json` per device. A missing or damaged file means no pins.
export class PinsService {
  constructor(
    private readonly root: string,
    private readonly log: Logger
  ) {}

  async get(udid: string): Promise<Pins> {
    this.check(udid)
    try {
      return channels['pins:set'].args.def.items[1]!.parse(
        JSON.parse(await readFile(pinsPath(this.root, udid), 'utf8'))
      )
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        this.log.warn('pins.json is unreadable, using no pins')
      return NO_PINS
    }
  }

  async set(udid: string, pins: Pins): Promise<Pins> {
    this.check(udid)
    const file = pinsPath(this.root, udid)
    await mkdir(dirname(file), { recursive: true })
    await writeFileAtomic(file, JSON.stringify(pins, null, 2))
    return pins
  }

  private check(udid: string): void {
    if (!isSafeUdid(udid)) throw new Error('bad udid')
  }
}
