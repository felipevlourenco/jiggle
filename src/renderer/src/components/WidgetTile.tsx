import s from './tiles.module.css'

// We can't draw a widget's contents, so it is a frosted placeholder of the right size.
// A stack is a widget that holds other widgets.
export function WidgetTile({ stack = false }: { stack?: boolean }) {
  return (
    <div className={s.widget} data-kind="widget">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="7" width="10" height="7" rx="2" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      {stack ? 'Widget stack' : 'Widget'}
    </div>
  )
}
