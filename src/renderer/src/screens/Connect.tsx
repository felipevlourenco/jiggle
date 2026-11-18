import { connectMessage } from '@shared/errors'
import type { Device } from '@shared/types'
import { Illustration } from '../components/Illustration'
import { useRefreshDevice } from '../state/queries'

interface Props {
  device: Device | undefined
  onContinueReadOnly: () => void
}

export function Connect({ device, onContinueReadOnly }: Props) {
  const message = connectMessage(device)
  const refresh = useRefreshDevice()
  const waiting = device?.state === 'locked' || device?.state === 'trust-pending'

  return (
    <div className="connect">
      <Illustration kind={message.illustration} />
      <h2>{message.title}</h2>
      <p className="connect-body">{message.body}</p>

      {message.steps && (
        <ol className="steps">
          {message.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      {waiting && (
        <p className="waiting" role="status">
          <span className="pulse" aria-hidden="true" /> Waiting for your {device.deviceClass}…
        </p>
      )}

      {message.action === 'retry' && device && (
        <button
          className="btn btn-primary"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate(device.udid)}
        >
          {refresh.isPending ? 'Checking…' : 'Try Again'}
        </button>
      )}
      {message.action === 'continue-read-only' && (
        <button className="btn btn-primary" onClick={onContinueReadOnly}>
          Continue in Read‑Only Mode
        </button>
      )}
    </div>
  )
}
