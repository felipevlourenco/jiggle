/* global process, setTimeout */
// A stand-in for the Python engine: same stdio protocol, scripted behaviour.
import { createInterface } from 'node:readline'

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')

createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method } = JSON.parse(line)
  if (method === 'ping') send({ id, result: { version: 'fake' } })
  else if (method === 'watch') {
    send({ id, result: { watching: true } })
    send({ event: 'device_attached', data: { udid: 'U1' } })
    setTimeout(() => send({ event: 'device_detached', data: { udid: 'U1' } }), 20)
  } else if (method === 'fail') send({ id, error: { code: 'nope', message: 'denied' } })
  else if (method === 'crash') process.exit(1)
  // any other method (e.g. "hang") is never answered
})
process.stdin.on('end', () => process.exit(0))
