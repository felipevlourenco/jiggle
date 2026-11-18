/* global process, Buffer */
// A stand-in for the Python engine: same stdio protocol, scripted behaviour.
import { createInterface } from 'node:readline'

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
const calls = {}

createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method, params } = JSON.parse(line)
  if (method === 'ping') send({ id, result: { version: 'fake' } })
  else if (method === 'watch') {
    send({ id, result: { watching: true } })
    send({ event: 'device_attached', data: { udid: 'U1' } })
  } else if (method === 'device_info') {
    // trust-pending for the first two checks, then ready
    const n = (calls[params.udid] = (calls[params.udid] ?? 0) + 1)
    send({
      id,
      result: {
        udid: params.udid,
        name: "Sam's iPhone",
        productType: 'iPhone17,1',
        modelName: 'iPhone 16 Pro',
        deviceClass: 'iPhone',
        osVersion: '26.1',
        connection: 'usb',
        state: n <= 2 ? 'trust-pending' : 'ready'
      }
    })
  } else if (method === 'get_icon_state') {
    send({
      id,
      result: [[{ bundleIdentifier: 'a.b', displayName: 'A' }], [{ listType: 'folder' }]]
    })
  } else if (method === 'get_icon_metrics') {
    send({
      id,
      result: { homeScreenIconColumns: 4, homeScreenIconRows: 6, homeScreenIconDockMaxCount: 4 }
    })
  } else if (method === 'get_icons') {
    const icons = {}
    for (const b of params.bundle_ids) icons[b] = Buffer.from('png-' + b).toString('base64')
    send({ id, result: icons })
  } else if (method === 'detach') {
    send({ id, result: {} })
    send({ event: 'device_detached', data: { udid: 'U1' } })
  } else if (method === 'fail') send({ id, error: { code: 'nope', message: 'denied' } })
  else if (method === 'crash') process.exit(1)
  // any other method (e.g. "hang") is never answered
})
process.stdin.on('end', () => process.exit(0))
