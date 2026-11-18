import { connectMessage } from '@shared/errors'
import type { Device } from '@shared/types'
import { Illustration } from '../components/Illustration'
import { CheckIcon } from '../components/icons'
import { useRefreshDevice } from '../state/queries'

interface Props {
  device: Device | undefined
  onContinueReadOnly: () => void
}

export function Connect({ device, onContinueReadOnly }: Props) {
  const message = connectMessage(device)
  const refresh = useRefreshDevice()
  const waiting = device?.state === 'locked' || device?.state === 'trust-pending'
  // Which of the three steps the person is on: the cable is in once a device shows up.
  const current = !device ? 0 : device.state === 'locked' ? 1 : 2
  const stepClass = (i: number): string | undefined =>
    device?.state === 'trust-declined' && i === 2
      ? 'current'
      : i < current
        ? 'done'
        : i === current
          ? 'current'
          : undefined

  return (
    <div className="connect">
      <Illustration kind={message.illustration} />
      <h2>{message.title}</h2>
      <p className="connect-body">{message.body}</p>

      {message.steps && (
        <ol className="steps">
          {message.steps.map((step, i) => (
            <li key={step} className={stepClass(i)}>
              <span className="step-n" aria-hidden="true">
                {stepClass(i) === 'done' ? <CheckIcon size={12} /> : i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      {waiting && (
        <p className="waiting" role="status">
          <span className="spin" aria-hidden="true" /> Waiting for your {device.deviceClass}…
        </p>
      )}

      {message.action === 'retry' && device && (
        <div className="actions">
          <button
            className="btn btn-primary btn-lg"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate(device.udid)}
          >
            {refresh.isPending ? 'Checking…' : 'Try Again'}
          </button>
        </div>
      )}
      {message.action === 'continue-read-only' && (
        <div className="actions">
          <button className="btn btn-primary btn-lg" onClick={onContinueReadOnly}>
            Continue in Read‑Only Mode
          </button>
        </div>
      )}
    </div>
  )
}
