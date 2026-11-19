import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { serialize } from '@shared/layout/serialize'
import { layoutSignature } from '@shared/layout/signature'
import { copyLayout } from '@shared/layout/reflow'
import { describeIssue, validateLayout } from '@shared/layout/validate'
import type { Device, Layout, SnapshotSummary } from '@shared/types'
import { Banner } from '../components/Banner'
import { BeforeAfter } from '../components/BeforeAfter'
import type { FrameKind } from '../components/PhoneFrame'
import { useDevices, useLayout, useSnapshots } from '../state/queries'
import { useOrganizeChoice } from '../state/store'
import { ApplySheet } from './Apply'
import { Sheet } from './SaveLayout'
import s from './apply.module.css'
import c from './copyLayout.module.css'

interface Source {
  key: string
  label: string
  udid: string // whose icons the preview uses
  kind: FrameKind
  load: () => Promise<Layout>
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

// S9: take another device's arrangement (live, or a layout saved from it) and fit it onto this one.
export function CopyLayoutSheet({ device, onClose }: { device: Device; onClose: () => void }) {
  const devices = useDevices().data
  const saved = useSnapshots(undefined).data
  const target = useLayout(device.udid).data?.layout
  const [choice, setChoice] = useOrganizeChoice()
  const [picked, setPicked] = useState<string>()
  const [applying, setApplying] = useState(false)

  const sources = useMemo<Source[]>(() => {
    const others = (devices ?? []).filter(
      (d) => d.udid !== device.udid && (d.state === 'ready' || d.state === 'unsupported-os')
    )
    const live = others.map((d): Source => ({
      key: `device:${d.udid}`,
      label: `${d.name} (connected)`,
      udid: d.udid,
      kind: d.deviceClass,
      load: async () => (await window.jiggle.layout.get(d.udid)).layout
    }))
    const layouts = (saved ?? [])
      .filter(
        (e): e is SnapshotSummary =>
          !e.damaged && e.kind === 'saved-layout' && e.udid !== device.udid
      )
      .map((e): Source => ({
        key: `saved:${e.udid}:${e.id}`,
        label: `${(devices ?? []).find((d) => d.udid === e.udid)?.name ?? e.deviceClass ?? 'iPhone'} · ${e.name}`,
        udid: e.udid,
        kind: e.deviceClass ?? 'iPhone',
        load: () => window.jiggle.snapshots.layout(e.udid, e.id)
      }))
    return [...live, ...layouts]
  }, [devices, saved, device.udid])

  const source = sources.find((x) => x.key === picked) ?? sources[0]
  const loaded = useQuery({
    queryKey: ['copy-source', source?.key],
    queryFn: () => source!.load(),
    enabled: !!source
  })
  const result = useMemo(
    () =>
      loaded.data && target
        ? copyLayout(loaded.data, target, { widgetMode: choice.widgetMode })
        : null,
    [loaded.data, target, choice.widgetMode]
  )
  const issues = useMemo(
    () => (result && target ? validateLayout(target, result.layout) : []),
    [result, target]
  )
  const readOnly = device.state === 'unsupported-os'
  const sharesNothing = !!result && result.shared === 0
  const summary = result
    ? `${plural(result.shared, 'shared app')} keep the ${source?.kind} order · ${plural(result.targetOnly, `${device.deviceClass}‑only app`)} added at the end · ${plural(result.sourceOnly, `${source?.kind}‑only app`)} skipped`
    : ''

  let body
  if (!sources.length) {
    body = <p className={c.note}>Connect another device or save a layout on it first.</p>
  } else if (loaded.isError) {
    body = (
      <Banner severity="error">
        Couldn’t read that layout. Make sure the device is connected and unlocked.
      </Banner>
    )
  } else if (!result) {
    body = (
      <p className={c.note} role="status">
        <span className="spin" aria-hidden="true" /> Matching apps…
      </p>
    )
  } else {
    body = (
      <>
        <div className={c.preview}>
          <BeforeAfter
            before={loaded.data!}
            after={result.layout}
            moved={new Set()}
            udid={device.udid}
            kind={device.deviceClass}
            beforeKind={source!.kind}
            beforeUdid={source!.udid}
            beforeLabel={source!.label}
          />
        </div>
        {sharesNothing ? (
          <Banner severity="error">These devices share no apps.</Banner>
        ) : (
          <p className={c.summary} data-testid="copy-summary">
            {summary}
          </p>
        )}
        {issues.length > 0 && (
          <Banner severity="error">
            This layout can’t be applied: {issues.map(describeIssue).join('; ')}.
          </Banner>
        )}
      </>
    )
  }

  return (
    <Sheet label={`Copy Layout to ${device.name}`} width={760} onClose={onClose}>
      <div className={s.head}>
        <h2>Copy Layout to {device.name}</h2>
      </div>
      <div className={`${s.body} ${c.body}`}>
        {sources.length > 0 && (
          <div className={c.controls}>
            <label className={c.row}>
              Copy from
              <select
                className="field"
                value={source?.key}
                onChange={(e) => setPicked(e.target.value)}
              >
                {sources.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <div className={c.row}>
              Widgets
              <div className="seg" role="radiogroup" aria-label="Widgets">
                {(['keep-pages', 'sort-around'] as const).map((mode) => (
                  <button
                    key={mode}
                    role="radio"
                    aria-checked={choice.widgetMode === mode}
                    onClick={() => setChoice({ widgetMode: mode })}
                  >
                    {mode === 'keep-pages' ? 'Keep widget pages' : 'Sort around widgets'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {body}
      </div>
      <div className={s.footer}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!result || sharesNothing || issues.length > 0 || readOnly}
          onClick={() => setApplying(true)}
        >
          Continue
        </button>
      </div>
      {applying && result && target && source && (
        <ApplySheet
          title={`Copy ${source.label} to ${device.name}?`}
          lines={[summary]}
          doneMessage={`Done! ${device.name} follows ${source.label}.`}
          udid={device.udid}
          run={() =>
            window.jiggle.apply.run({
              udid: device.udid,
              reason: 'copying a layout',
              beforeSignature: layoutSignature(serialize(target)),
              after: result.layout,
              removedFromHomeScreen: []
            })
          }
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}
