import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBackendQuery } from '../lib/useBackend'
import { usePoll } from '../lib/usePoll'
import { TokenAvatar } from '../components/TokenAvatar'
import { EmptyState } from '../components/Empty'
import { PriceChart } from '../components/PriceChart'
import { fmtChange, fmtNum, fmtPct, fmtPrice, fmtUsd, shortAddr, timeAgo } from '../lib/format'
import { getCandles, getHoldersApi, getStats, getTradesApi, type Timeframe } from '../lib/registry'

const TFS: Timeframe[] = ['1m', '5m', '15m', '1h', '1d']

export function Token() {
  const { mint = '' } = useParams()
  const [token, tLoading] = useBackendQuery((b) => b.getToken(mint), [mint])
  const listed = !!token
  const [tf, setTf] = useState<Timeframe>('1m')
  const [stats] = usePoll(() => (listed ? getStats(mint) : Promise.resolve(null)), 4000, [mint, listed])
  const [trades] = usePoll(() => (listed ? getTradesApi(mint, 50) : Promise.resolve([])), 4000, [mint, listed])
  const [chart] = usePoll(() => (listed ? getCandles(mint, tf) : Promise.resolve(null)), 5000, [mint, tf, listed])
  const [holders] = usePoll(() => (listed ? getHoldersApi(mint) : Promise.resolve(null)), 15000, [mint, listed])
  const [copied, setCopied] = useState(false)

  const name = token?.name ?? (tLoading ? 'Loading…' : 'Unlisted coin')
  const symbol = token?.symbol ?? '—'
  const progress = stats?.curveProgress ?? token?.curveProgress ?? 0
  const graduated = stats?.graduated ?? false
  const change = stats?.change24h ?? null

  return (
    <section className="container section token-page">
      <div className="token-head rise">
        <TokenAvatar src={token?.imageUrl} symbol={token?.symbol ?? '?'} size={72} />
        <div className="th-id">
          <div className="th-row"><h1>{name}</h1>{token?.genesis && <span className="pill pill-green">First born</span>}</div>
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
          <div className="mono big">{stats?.marketCapUsd != null ? fmtUsd(stats.marketCapUsd) : stats?.marketCapSol != null ? `${fmtNum(stats.marketCapSol)} SOL` : '—'}</div>
          {change != null && <div className={`mono chg ${change >= 0 ? 'up' : 'down'}`}>{fmtChange(change)} <span className="dim">24h</span></div>}
        </div>
      </div>

      {!tLoading && !token && <div className="notice info rise">This coin isn't listed on CONDOM.</div>}

      {listed && (
        <div className="stat-strip rise" style={{ animationDelay: '40ms' }}>
          <Stat k="Price" v={stats?.priceUsd != null ? fmtUsd(stats.priceUsd) : '—'} sub={fmtPrice(stats?.priceSol)} />
          <Stat k="24h volume" v={stats ? fmtUsd(stats.volume24hUsd) : '—'} sub={stats ? `${fmtNum(stats.volume24hSol)} SOL` : ''} />
          <Stat k="24h txns" v={stats ? fmtNum(stats.txns24h, 0) : '—'} sub={stats ? `${stats.buys24h} buys · ${stats.sells24h} sells` : ''} />
          <Stat k="Holders" v={stats?.holderCount != null ? fmtNum(stats.holderCount, 0) : holders?.count != null ? fmtNum(holders.count, 0) : '—'} />
          <Stat k="ATH mcap" v={stats ? fmtUsd(stats.athMarketCapUsd) : '—'} />
          <Stat k={graduated ? 'Liquidity' : 'SOL in curve'} v={graduated ? fmtUsd(stats?.liquidityUsd) : stats?.solInCurve != null ? `${stats.solInCurve.toFixed(2)} SOL` : '—'} />
        </div>
      )}

      <div className="token-grid">
        <div className="token-main">
          <div className="glass card chart rise" style={{ animationDelay: '60ms' }}>
            <div className="chart-top">
              <span className="dim small-note">Market cap{chart?.unit === 'usd' ? ' (USD)' : ' (SOL)'}</span>
              <div className="seg sm">{TFS.map((t) => <button key={t} className={tf === t ? 'on' : ''} onClick={() => setTf(t)} disabled={!listed}>{t}</button>)}</div>
            </div>
            <div className="chart-area">
              {chart && chart.items.length > 0
                ? <PriceChart candles={chart.items} unit={chart.unit} />
                : <div className="chart-empty"><div className="dim">{listed ? 'Chart starts at the first trade.' : 'No chart.'}</div></div>}
            </div>
          </div>

          <div className="glass card rise" style={{ animationDelay: '120ms' }}>
            <div className="card-label">Trades <span className="live-dot" aria-label="live" /></div>
            {trades && trades.length > 0 ? (
              <div className="table">
                <div className="tr th mono"><span>Trader</span><span>Side</span><span>SOL</span><span>Tokens</span><span>Age</span></div>
                {trades.map((t) => (
                  <a className="tr mono" key={t.signature + t.side + t.tokens} href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noreferrer">
                    <span>{shortAddr(t.trader)}{token && t.trader === token.creator && <span className="tag dev">dev</span>}</span>
                    <span className={t.side}>{t.side}</span><span>{t.sol.toFixed(3)}</span><span>{fmtNum(t.tokens)}</span><span className="dim">{timeAgo(t.timestamp)}</span>
                  </a>
                ))}
              </div>
            ) : <EmptyState compact title="No trades yet." body="Trades show up here live." />}
          </div>
        </div>

        <aside className="token-side">
          <div className="glass card trade rise" style={{ animationDelay: '80ms' }}>
            <div className="card-label">Trade</div>
            <p className="muted small-note">{graduated ? 'Graduated. Trade it on the DEX.' : 'Trades on the pump.fun bonding curve.'}</p>
            <a className="btn btn-green btn-block" href={graduated && stats?.dexUrl ? stats.dexUrl : `https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer">
              {graduated && stats?.dexUrl ? 'Trade on DEX ↗' : 'Trade on pump.fun ↗'}
            </a>
          </div>

          <div className="glass card rise" style={{ animationDelay: '140ms' }}>
            <div className="card-label">Bonding curve</div>
            <div className="curve-big">
              <div className="mono big">{graduated ? 'Graduated' : fmtPct(progress * 100, 1)}</div>
              {!graduated && <div className="dim">to graduation</div>}
            </div>
            <div className="bar lg"><i style={{ width: `${Math.max(1.5, progress * 100)}%` }} /></div>
            {stats?.solInCurve != null && !graduated && <p className="fine dim mono">{stats.solInCurve.toFixed(3)} SOL in the curve</p>}
          </div>

          <div className="glass card rise" style={{ animationDelay: '260ms' }}>
            <div className="card-label">Top holders{holders?.count != null ? <span className="dim small-note"> · {fmtNum(holders.count, 0)} total</span> : null}</div>
            {holders && holders.items.length > 0 ? (
              <div className="holders">
                {holders.items.map((h, i) => (
                  <a className="holder mono" key={h.owner + i} href={`https://solscan.io/account/${h.owner}`} target="_blank" rel="noreferrer">
                    <span className="dim">{i + 1}</span><span>{shortAddr(h.owner)}</span>
                    {h.tag && <span className={`tag ${h.tag}`}>{h.tag === 'curve' ? 'bonding curve' : h.tag}</span>}
                    <span className="hp">{fmtPct(h.pct)}</span>
                  </a>
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

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="stat glass">
      <div className="stat-k dim">{k}</div>
      <div className="stat-v mono">{v}</div>
      {sub ? <div className="stat-sub dim mono">{sub}</div> : null}
    </div>
  )
}
