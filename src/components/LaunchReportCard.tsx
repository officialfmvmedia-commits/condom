import type { LaunchReport, CheckStatus } from '../lib/launchpad/report'
import { Mark } from './Brand'
import { fmtPct, shortAddr } from '../lib/format'

const PENDING = [
  { id: 'dev-block0', label: 'Dev buys in block 0' },
  { id: 'block0', label: 'Outside block-0 buys' },
  { id: 'dev-cap', label: 'Dev buy % of supply' },
  { id: 'create-bundle', label: 'Bundle check' },
  { id: 'dev-funded', label: 'Dev-funded wallets' },
]

const ico = (s: CheckStatus) => (s === 'pass' ? '✓' : s === 'warn' ? '!' : '✕')

export function LaunchReportCard({ report, loading }: { report: LaunchReport | null | undefined; loading?: boolean }) {
  if (!report) {
    return (
      <div className="glass card report">
        <div className="report-head">
          <div className="card-label">Launch report</div>
          <span className="pill">{loading ? 'Loading…' : 'Pending'}</span>
        </div>
        <ul className="report-checks">
          {PENDING.map((c) => (
            <li key={c.id} className="pending"><span className="rc-ico">·</span><span>{c.label}</span><span className="dim mono">—</span></li>
          ))}
        </ul>
        <p className="fine dim">Generated from on-chain data right after launch: the creation slot plus the next 2 slots.</p>
      </div>
    )
  }
  const named = report.earlyBuys.filter((b) => b.block0 && !b.isDev)
  const funded = report.earlyBuys.filter((b) => b.fundedByDev)
  return (
    <div className="glass card report">
      <div className="report-head">
        <div className="card-label">Launch report</div>
        <span className={`grade-chip ${report.grade.toLowerCase()}`}><Mark size={12} color="currentColor" />{report.grade}</span>
      </div>
      <div className="report-stats">
        <div><span className="mono">{report.dev.block0Buy ? 'Yes' : 'No'}</span><small>dev in block 0</small></div>
        <div><span className="mono">{report.summary.block0Buyers}</span><small>outside block-0</small></div>
        <div><span className="mono">{fmtPct(report.dev.buyPctOfSupply)}</span><small>dev buy</small></div>
        <div><span className="mono">{report.summary.devFundedWallets}</span><small>dev-funded</small></div>
      </div>
      <ul className="report-checks">
        {report.checks.map((c) => (
          <li key={c.id} className={c.status} title={c.detail}>
            <span className="rc-ico">{ico(c.status)}</span><span>{c.label}</span><span className="dim rc-detail">{c.detail}</span>
          </li>
        ))}
      </ul>
      {named.length > 0 && (
        <div className="named">
          <div className="card-label small">Named: block-0 buyers</div>
          {named.slice(0, 8).map((b) => (
            <a key={b.signature} className="named-row mono" href={`https://solscan.io/tx/${b.signature}`} target="_blank" rel="noreferrer">
              <span>{shortAddr(b.buyer, 5)}</span><span>{b.sol.toFixed(2)} SOL</span><span className="latex-text">{fmtPct(b.pctOfSupply)}</span>
            </a>
          ))}
          {named.length > 8 && <div className="dim fine">+{named.length - 8} more</div>}
        </div>
      )}
      {funded.length > 0 && (
        <div className="named">
          <div className="card-label small">Flagged: funded by the dev</div>
          {funded.slice(0, 8).map((b) => (
            <a key={b.signature + b.buyer} className="named-row mono" href={`https://solscan.io/tx/${b.fundingSignatures[0] ?? b.signature}`} target="_blank" rel="noreferrer">
              <span>{shortAddr(b.buyer, 5)}</span><span>+{b.slotOffset} slot{b.slotOffset === 1 ? '' : 's'}</span><span className="flag-text">{fmtPct(b.pctOfSupply)}</span>
            </a>
          ))}
        </div>
      )}
      <p className="fine dim">Slots {report.window.fromSlot}–{report.window.toSlot} · generated {new Date(report.generatedAt).toLocaleString()}</p>
    </div>
  )
}
