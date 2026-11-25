import { join } from 'node:path'

// Where the device engine lives. Packaged: the frozen program in Resources. Dev: the Python of the sidecar's venv.
export function packagedEngine(resources: string, platform: string): string {
  const exe = platform === 'win32' ? '.exe' : ''
  return join(resources, `sidecar/jiggle_engine/jiggle_engine${exe}`)
}

export function venvPython(sidecarDir: string, platform: string): string {
  return join(sidecarDir, platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python')
}
