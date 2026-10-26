
/** Token image, or a generated monogram when there's no image. */
export function TokenAvatar({ src, symbol, size = 56 }: { src?: string | null; symbol: string; size?: number }) {
  if (src) return <img className="token-avatar" src={src} alt="" style={{ width: size, height: size }} />
  if (!symbol || symbol === '?') {
    return <div className="token-avatar mono-avatar unknown" style={{ width: size, height: size }}><span style={{ fontSize: size * 0.4 }}>?</span></div>
  }
  let h = 0
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) % 360
  return (
    <div className="token-avatar mono-avatar" style={{ width: size, height: size, fontSize: size * 0.3, ['--h' as string]: h }}>
      {symbol.slice(0, 3) || '?'}
    </div>
  )
}
