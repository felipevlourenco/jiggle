import type { ReactNode } from 'react'

// The design's 16×16 line icons. Decorative: always hidden from assistive tech.
function icon(paths: ReactNode, opts: { stroke?: number; join?: boolean; cap?: boolean } = {}) {
  return function Icon({ size = 16 }: { size?: number }) {
    return (
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={opts.stroke ?? 1.5}
        strokeLinejoin={opts.join ? 'round' : undefined}
        strokeLinecap={opts.cap ? 'round' : undefined}
        aria-hidden="true"
      >
        {paths}
      </svg>
    )
  }
}

export const PinIcon = icon(
  <>
    <path d="M9.5 1.5l5 5-2 .5-2.5 2.5.5 3-1 1-3-3-4.5 4.5M6 5.5l-1.5-.5-1 1 6.5 6.5" />
  </>,
  { join: true, cap: true }
)
export const PhoneIcon = icon(
  <>
    <rect x="4.5" y="1.5" width="7" height="13" rx="2" />
    <path d="M7 12.5h2" />
  </>
)
export const TabletIcon = icon(
  <>
    <rect x="1.5" y="3.5" width="13" height="9" rx="2" />
    <path d="M13 8h.01" />
  </>
)
export const SwitchIcon = icon(<path d="M5 6.5L8 3.5l3 3M5 9.5l3 3 3-3" />, {
  stroke: 1.5,
  cap: true,
  join: true
})
export const WifiIcon = icon(
  <>
    <path d="M1.5 6a9.5 9.5 0 0113 0M3.8 8.6a6.2 6.2 0 018.4 0M6.2 11.2a2.8 2.8 0 013.6 0" />
    <path d="M8 13.5h.01" />
  </>,
  { cap: true }
)
export const HomeIcon = icon(
  <>
    <rect x="2" y="2" width="5" height="5" rx="1.5" />
    <rect x="9" y="2" width="5" height="5" rx="1.5" />
    <rect x="2" y="9" width="5" height="5" rx="1.5" />
    <rect x="9" y="9" width="5" height="5" rx="1.5" />
  </>
)
export const AppsIcon = icon(
  <>
    <path d="M6 4h8M6 8h8M6 12h8" />
    <circle cx="2.8" cy="4" r=".9" />
    <circle cx="2.8" cy="8" r=".9" />
    <circle cx="2.8" cy="12" r=".9" />
  </>
)
export const OrganizeIcon = icon(<path d="M4 2.5v11M2 11.5l2 2 2-2M8.5 4h5.5M8.5 8h4M8.5 12h2.5" />)
export const HistoryIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.8V8l2.2 1.5" />
  </>
)
export const CleanupIcon = icon(
  <>
    <path d="M7 1.8l1.3 3.4 3.4 1.3-3.4 1.3L7 11.2 5.7 7.8 2.3 6.5l3.4-1.3z" />
    <path d="M12.3 9.8l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" />
  </>,
  { stroke: 1.4, join: true }
)
export const CheckIcon = icon(<path d="M3 8.5l3 3 7-7" />, { stroke: 1.8 })
export const ErrorIcon = icon(
  <>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 4.8v3.6M8 10.9v.3" />
  </>,
  { stroke: 1.6 }
)
export const WarnIcon = icon(
  <>
    <path d="M8 2.2l6.2 11H1.8z" />
    <path d="M8 6.6v3M8 11.4v.2" />
  </>,
  { stroke: 1.6, join: true }
)
export const InfoIcon = icon(
  <>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 7.2v4M8 4.8v.2" />
  </>,
  { stroke: 1.6 }
)
export const ShieldIcon = icon(
  <>
    <path d="M8 1.8l5 2v4c0 3.2-2.2 5.3-5 6.4-2.8-1.1-5-3.2-5-6.4v-4z" />
    <path d="M5.8 8l1.6 1.6 3-3" />
  </>,
  { join: true }
)
export const MoveIcon = icon(<path d="M2 5h9M8.5 2.5L11 5 8.5 7.5M14 11H5M7.5 8.5L5 11l2.5 2.5" />)
export const FolderIcon = icon(
  <path d="M2 4.5a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1z" />,
  { join: true }
)
export const SearchIcon = icon(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </>,
  { stroke: 1.6 }
)
export const ChevronLeft = icon(<path d="M10 3.5L5.5 8l4.5 4.5" />, { stroke: 1.6 })
export const ChevronRight = icon(<path d="M6 3.5L10.5 8 6 12.5" />, { stroke: 1.6 })
export const ArrowRight = icon(<path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" />)
export const BackUpIcon = icon(
  <>
    <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9" />
    <path d="M13.5 2.5v3h-3" />
  </>,
  { cap: true }
)
export const GearIcon = icon(
  <>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1" />
    <circle cx="8" cy="8" r="4.6" />
  </>,
  { stroke: 1.3 }
)
export const ShieldOutline = icon(
  <path d="M8 1.8l5 2v4c0 3.2-2.2 5.3-5 6.4-2.8-1.1-5-3.2-5-6.4v-4z" />,
  { stroke: 1.3, join: true }
)
export const LockIcon = icon(
  <>
    <rect x="3.5" y="7" width="9" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
  </>,
  { stroke: 1.6 }
)
export const PencilIcon = icon(<path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z" />, { join: true })
export const UndoIcon = icon(
  <>
    <path d="M5.5 3.5L2.5 6.5l3 3" />
    <path d="M2.5 6.5h7a3.5 3.5 0 010 7H7.5" />
  </>,
  { cap: true }
)
export const RedoIcon = icon(
  <>
    <path d="M10.5 3.5l3 3-3 3" />
    <path d="M13.5 6.5h-7a3.5 3.5 0 000 7h2" />
  </>,
  { cap: true }
)
