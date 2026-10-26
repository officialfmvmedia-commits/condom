import type { CSSProperties } from 'react'

/** The CONDOM seal ring: thick rolled rim + hairline inner ring. Geometry matches brand/src/gen.py. */
export function Mark({ size = 24, color = 'var(--latex)', style }: { size?: number; color?: string; style?: CSSProperties }) {
  const r = 50, sw = r * 0.34, ro = r - sw / 2
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style} aria-hidden="true">
      <circle cx="50" cy="50" r={ro} fill="none" stroke={color} strokeWidth={sw} />
      <circle cx="50" cy="50" r={r * 0.36} fill="none" stroke={color} strokeWidth={r * 0.085} />
    </svg>
  )
}

export function Wordmark({ height = 20 }: { height?: number }) {
  return <img src="/brand/condom-wordmark-bone.svg" alt="CONDOM" style={{ height, width: 'auto', display: 'block' }} />
}

/** The badge every token born on CONDOM carries. */
export function ProtectedBadge({ size = 'md', label = 'Protected' }: { size?: 'sm' | 'md'; label?: string }) {
  return (
    <span className={`badge-protected ${size}`}>
      <Mark size={size === 'sm' ? 11 : 13} color="currentColor" />
      {label}
    </span>
  )
}

/** Large animated seal used in heroes. */
export function Seal({ size = 420 }: { size?: number }) {
  return (
    <div className="seal" style={{ width: size, height: size }} aria-hidden="true">
      <div className="seal-orbit o1" />
      <div className="seal-orbit o2" />
      <div className="seal-orbit o3" />
      <img className="seal-text" src="/brand/condom-seal-protected.svg" alt="" />
      <div className="seal-core" />
    </div>
  )
}
