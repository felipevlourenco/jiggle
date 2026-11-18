import type { ConnectMessage } from '@shared/errors'

// A plain phone outline with one extra drawing that says what to do next.
export function Illustration({ kind }: { kind: ConnectMessage['illustration'] }) {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-hidden="true">
      <rect x="50" y="12" width="60" height="116" rx="12" className="ill-phone" />
      <rect x="68" y="18" width="24" height="5" rx="2.5" className="ill-notch" />
      {kind === 'cable' && (
        <g className="ill-line">
          <path d="M80 128 V144 H112" fill="none" />
          <rect x="112" y="138" width="14" height="12" rx="3" className="ill-fill" />
        </g>
      )}
      {kind === 'lock' && (
        <g>
          <path d="M70 66 v-8 a10 10 0 0 1 20 0 v8" className="ill-line" fill="none" />
          <rect x="64" y="66" width="32" height="26" rx="5" className="ill-accent" />
        </g>
      )}
      {kind === 'trust' && (
        <g>
          <rect x="58" y="48" width="44" height="52" rx="8" className="ill-card" />
          <rect x="63" y="80" width="34" height="14" rx="5" className="ill-accent" />
          <rect x="66" y="56" width="28" height="4" rx="2" className="ill-notch" />
          <rect x="70" y="65" width="20" height="4" rx="2" className="ill-notch" />
        </g>
      )}
      {kind === 'warning' && (
        <g>
          <path d="M80 54 L100 90 H60 Z" className="ill-warn" strokeLinejoin="round" />
          <rect x="78.5" y="66" width="3" height="12" rx="1.5" className="ill-bang" />
          <circle cx="80" cy="83" r="1.8" className="ill-bang" />
        </g>
      )}
    </svg>
  )
}
