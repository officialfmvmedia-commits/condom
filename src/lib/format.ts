export const shortAddr = (a: string, n = 4) => (a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a)

export function fmtNum(n: number, max = 2): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString('en-US', { maximumFractionDigits: max })
}

export const fmtPct = (n: number, d = 2) => `${n.toFixed(d)}%`
export const fmtSol = (n: number, d = 2) => `${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })} SOL`

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  if (abs >= 1) return `$${n.toFixed(2)}`
  return `$${n.toPrecision(3)}`
}

/** Tiny prices: 0.0000000315 -> "0.0₇315" style is hard to read; use 3 significant digits. */
export function fmtPrice(n: number | null | undefined, unit = 'SOL'): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '—'
  return `${n < 0.001 ? n.toPrecision(3) : n.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${unit}`
}

export function fmtChange(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`
}
