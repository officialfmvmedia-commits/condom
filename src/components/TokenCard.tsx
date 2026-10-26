import { Link } from 'react-router-dom'
import type { TokenSummary } from '../lib/launchpad/types'
import { TokenAvatar } from './TokenAvatar'
import { fmtNum, fmtPct, shortAddr, timeAgo } from '../lib/format'

export function TokenCard({ t, preview = false }: { t: TokenSummary; preview?: boolean }) {
  const body = (
    <>
      <div className="tc-top">
        <TokenAvatar src={t.imageUrl} symbol={t.symbol} />
        <div className="tc-id">
          <div className="tc-name">{t.name || 'Your coin'}</div>
          <div className="tc-sym mono">${t.symbol || 'TICKER'}</div>
        </div>
        {t.genesis && <span className="pill pill-green tc-first">First born</span>}
      </div>
      {t.description ? <p className="tc-desc">{t.description}</p> : <p className="tc-desc dim">No description yet.</p>}
      <div className="tc-curve">
        <div className="bar"><i style={{ width: `${Math.max(2, t.curveProgress * 100)}%` }} /></div>
        <div className="tc-meta mono">
          <span>{t.marketCapSol != null ? `MC ${fmtNum(t.marketCapSol)} SOL` : 'MC —'}</span>
          <span>{fmtPct(t.curveProgress * 100, 0)} curve</span>
        </div>
      </div>
      <div className="tc-foot mono dim">
        <span>dev {t.devBuyPct != null ? fmtPct(t.devBuyPct, 2) : '—'}</span>
        <span>{preview ? 'just now' : `${shortAddr(t.creator)} · ${timeAgo(t.createdAt)}`}</span>
      </div>
    </>
  )
  return preview ? <div className="token-card glass">{body}</div> : <Link to={`/token/${t.mint}`} className="token-card glass">{body}</Link>
}
