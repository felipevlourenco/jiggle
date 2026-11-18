import s from './pageDots.module.css'

export function PageDots({
  count,
  current,
  onSelect
}: {
  count: number
  current: number
  onSelect: (page: number) => void
}) {
  return (
    <div className={s.dots} role="group" aria-label="Pages">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          className={`${s.dot} ${i === current ? s.active : ''}`}
          aria-label={`Page ${i + 1}`}
          aria-current={i === current ? 'page' : undefined}
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  )
}
