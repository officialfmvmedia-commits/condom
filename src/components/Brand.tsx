import type { CSSProperties } from 'react'

/** Photo logo: top-down green condom on white (brand/png/condom-real-top.jpg), round crop. */
export function Logo({ size = 36, style }: { size?: number; style?: CSSProperties }) {
  return <img className="logo" src={size > 48 ? '/img/logo-192.png' : '/img/logo-96.png'} width={size} height={size} alt="" style={style} />
}

/** Simple rounded wordmark, live text in Nunito 900 (outlined copies in brand/svg). */
export function Wordmark({ size = 22 }: { size?: number }) {
  return <span className="wordmark" style={{ fontSize: size }}>CONDOM</span>
}

type IconKind = 'check' | 'warn' | 'cross' | 'info'
/** Small rounded glyphs used in chips, badges and notices. */
export function Icon({ kind = 'check', size = 14 }: { kind?: IconKind; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {kind === 'check' && <path d="M5 10.5l3.2 3.2L15 6.8" {...p} />}
      {kind === 'cross' && <path d="M6 6l8 8M14 6l-8 8" {...p} />}
      {kind === 'warn' && <path d="M10 5v6M10 15h.01" {...p} />}
      {kind === 'info' && <path d="M10 9v6M10 5.5h.01" {...p} />}
    </svg>
  )
}

/** Small green check pill. */
export function ProtectedBadge({ size = 'md', label = 'Born on CONDOM' }: { size?: 'sm' | 'md'; label?: string }) {
  return (
    <span className={`badge-protected ${size}`}>
      <Icon kind="check" size={size === 'sm' ? 16 : 18} />
      {label}
    </span>
  )
}

/** The seal sticker (brand/svg/condom-seal-protected.svg). Pure visual. */
export function Seal({ className, style }: { className?: string; style?: CSSProperties }) {
  return <img className={className} style={style} src="/img/seal-protected.svg" alt="" aria-hidden="true" />
}
