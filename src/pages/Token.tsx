import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBackendQuery } from '../lib/useBackend'
import { TokenAvatar } from '../components/TokenAvatar'
import { GradePill } from '../components/Grade'
import { EmptyState } from '../components/Empty'
import { LaunchReportCard } from '../components/LaunchReportCard'
import { fmtNum, fmtPct, shortAddr, timeAgo } from '../lib/format'

export function Token() {
  const { mint = '' } = useParams()
  const [token, tLoading] = useBackendQuery((b) => b.getToken(mint), [mint])
  const [trades] = useBackendQuery((b) => b.getTrades(mint, 50), [mint])
  const [holders] = useBackendQuery((b) => b.getHolders(mint, 20), [mint])
  const [report, rLoading] = useBackendQuery((b) => b.getLaunchReport(mint), [mint])
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [copied, setCopied] = useState(false)

  const name = token?.name ?? (tLoading ? 'Loading…' : 'Unlisted coin')
  const symbol = token?.symbol ?? '—'
  const progress = token?.curveProgress ?? 0
  const live = !!token

  return (
    <section className="container section token-page">
      <div className="token-head rise">
        <TokenAvatar src={token?.imageUrl} symbol={token?.symbol ?? '?'} size={72} />
        <div className="th-id">
          <div className="th-row"><h1>{name}</h1>{token && <GradePill grade={report?.grade ?? token.grade} />}</div>
          <div className="th-meta mono dim">
            <span>${symbol}</span>
            <button className="copy" onClick={() => { navigator.clipboard?.writeText(mint); setCopied(true); setTimeout(() => setCopied(false), 1200) }}>
              {shortAddr(mint, 6)} {copied ? '✓' : '⧉'}
            </button>
            {token && <span>by {shortAddr(token.creator)} · {timeAgo(token.createdAt)} ago</span>}
          </div>
        </div>
        <div className="th-mc">
          <div className="dim">Market cap</div>
          <div className="mono big">{token?.marketCapSol != null ? `${fmtNum(token.marketCapSol)} SOL` : '—'}</div>
        </div>
      </div>

      {!tLoading && !token && (
        <div className="notice info rise">This coin isn't listed on CONDOM. Charts, trades and holders appear here for coins born on CONDOM.</div>
      )}

      <div className="token-grid">
        <div className="token-main">
          <div className="glass card chart rise" style={{ animationDelay: '60ms' }}>
            <div className="chart-top">
              <div className="seg sm">{['1m', '5m', '1h', '1d'].map((t, i) => <button key={t} className={i === 1 ? 'on' : ''} disabled={!live}>{t}</button>)}</div>
            </div>
            <div className="chart-area">
              <svg className="chart-ghost" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
                {[40, 80, 120, 160].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} />)}
              </svg>
              <div className="chart-empty"><div className="dim">Chart starts at the first trade.</div></div>
            </div>
          </div>

          <div className="glass card rise" style={{ animationDelay: '120ms' }}>
            <div className="card-label">Trades</div>
            {trades && trades.length > 0 ? (
              <div className="table">
                <div className="tr th mono"><span>Trader</span><span>Side</span><span>SOL</span><span>Tokens</span><span>Age</span></div>
                {trades.map((t) => (
                  <div className="tr mono" key={t.signature}>
                    <span>{shortAddr(t.trader)}</span><span className={t.side}>{t.side}</span><span>{t.sol.toFixed(3)}</span><span>{fmtNum(t.tokens)}</span><span className="dim">{timeAgo(t.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState compact title="No trades yet." body="Every trade lands here in real time." />}
          </div>
        </div>

        <aside className="token-side">
          <div className="glass card trade rise" style={{ animationDelay: '80ms' }}>
            <div className="seg block">
              <button className={side === 'buy' ? 'on buy' : ''} onClick={() => setSide('buy')}>Buy</button>
              <button className={side === 'sell' ? 'on sell' : ''} onClick={() => setSide('sell')}>Sell</button>
            </div>
            <div className="amount">
              <input className="mono" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
              <span className="mono dim">{side === 'buy' ? 'SOL' : symbol}</span>
            </div>
            <div className="chips">
              {(side === 'buy' ? ['0.1', '0.5', '1'] : ['25%', '50%', '100%']).map((c) => <button key={c} className="chip mono" onClick={() => side === 'buy' && setAmount(c)}>{c}</button>)}
            </div>
            <button className="btn btn-latex btn-block" disabled>{live ? 'Trading opens soon' : 'Not tradable here yet'}</button>
          </div>

          <div className="glass card rise" style={{ animationDelay: '140ms' }}>
            <div className="card-label">Bonding curve</div>
            <div className="curve-big">
              <div className="mono big">{fmtPct(progress * 100, 1)}</div>
              <div className="dim">to graduation</div>
            </div>
            <div className="bar lg"><i style={{ width: `${Math.max(1.5, progress * 100)}%` }} /></div>
          </div>

          <div className="rise" style={{ animationDelay: '200ms' }}><LaunchReportCard report={report} loading={rLoading} /></div>

          <div className="glass card rise" style={{ animationDelay: '260ms' }}>
            <div className="card-label">Holders</div>
            {holders && holders.length > 0 ? (
              <div className="holders">
                {holders.map((h, i) => (
                  <div className="holder mono" key={h.owner}>
                    <span className="dim">{i + 1}</span><span>{shortAddr(h.owner)}</span>
                    {h.tag && <span className={`tag ${h.tag}`}>{h.tag}</span>}
                    <span className="hp">{fmtPct(h.pct)}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState compact title="No holders yet." />}
          </div>
        </aside>
      </div>
      <div className="back"><Link to="/" className="link">← All coins</Link></div>
    </section>
  )
}
