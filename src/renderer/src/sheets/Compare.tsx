import { useQuery } from '@tanstack/react-query'
import { compareLayouts, hasChanges, type LayoutDiff } from '@shared/layout/diff'
import type { Layout } from '@shared/types'
import s from './apply.module.css'
import c from './compare.module.css'
import { Sheet } from './SaveLayout'

const SHOWN = 40 // rows per section; a full re-sort moves hundreds
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

function Section({ title, hint, rows }: { title: string; hint?: string; rows: string[] }) {
  if (rows.length === 0) return null
  return (
    <section className={c.section}>
      <h3>{title}</h3>
      {hint && <p className={c.hint}>{hint}</p>}
      <ul className={c.list}>
        {rows.slice(0, SHOWN).map((row, i) => (
          <li key={i}>{row}</li>
        ))}
      </ul>
      {rows.length > SHOWN && <p className={c.hint}>and {rows.length - SHOWN} more</p>}
    </section>
  )
}

function Result({ diff }: { diff: LayoutDiff }) {
  if (!hasChanges(diff)) {
    return <p className={c.same}>No differences. The home screen matches.</p>
  }
  return (
    <>
      <Section
        title={`${plural(diff.moved.length, 'app')} moved`}
        rows={diff.moved.map((m) => `${m.name}: ${m.from} → ${m.to}`)}
      />
      <Section title="Now on the Home Screen" rows={diff.added.map((a) => `${a.name}: ${a.at}`)} />
      <Section
        title="No longer on the Home Screen"
        hint="In the App Library now, or uninstalled."
        rows={diff.removed.map((a) => `${a.name}: was ${a.at}`)}
      />
      <Section
        title="Folders"
        rows={diff.folders.map((f) =>
          f.kind === 'renamed'
            ? `“${f.name}” renamed to “${f.to}”`
            : `“${f.name}” ${f.kind === 'added' ? 'is new' : 'is gone'}`
        )}
      />
      {diff.pages.before !== diff.pages.after && (
        <Section
          title="Pages"
          rows={[`${plural(diff.pages.before, 'page')} → ${plural(diff.pages.after, 'page')}`]}
        />
      )}
    </>
  )
}

// History > Compare: what changed from a saved copy (`name`) to `against`, which is the phone now or the newest backup.
// Read only: nothing is written anywhere.
export function CompareSheet({
  name,
  loadBefore,
  against,
  onClose
}: {
  name: string
  loadBefore: () => Promise<Layout>
  against: { label: string; load: () => Promise<Layout> }
  onClose: () => void
}) {
  const diff = useQuery({
    queryKey: ['compare', name, against.label],
    gcTime: 0,
    queryFn: async () => compareLayouts(await loadBefore(), await against.load())
  })
  return (
    <Sheet label={`Compare “${name}”`} onClose={onClose} width={560}>
      <div className={s.head}>
        <h2>Compare “{name}”</h2>
        <p className={c.hint}>
          What changed from “{name}” to {against.label}.
        </p>
      </div>
      <div className={`${s.body} ${c.body}`}>
        {diff.isPending && <p className={c.hint}>Comparing…</p>}
        {diff.isError && (
          <p role="alert" className={c.hint}>
            Couldn’t compare: {(diff.error as Error).message}
          </p>
        )}
        {diff.data && <Result diff={diff.data} />}
      </div>
      <div className={s.footer}>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  )
}
