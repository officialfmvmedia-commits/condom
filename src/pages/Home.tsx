import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Seal, ProtectedBadge, Icon } from '../components/Brand'
import { TokenCard } from '../components/TokenCard'
import { EmptyState } from '../components/Empty'
import { Reveal } from '../components/Reveal'
import { useBackend, useBackendQuery } from '../lib/useBackend'
import { usePoll } from '../lib/usePoll'
import type { TokenSort } from '../lib/launchpad/types'
import { RULES } from '../lib/rules'

const CLAIMS = [
  { k: 'No block 0', v: 'The dev never buys block zero' },
  { k: 'Max 1%', v: `${RULES.MAX_DEV_BUY_SOL} SOL dev buy cap` },
  { k: 'No bundles', v: "Dev can't bundle block zero" },
  { k: 'No vamps', v: 'One ticker, one coin' },
]

const SORTS: { id: TokenSort; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'rising', label: 'Rising' },
  { id: 'graduating', label: 'Graduating' },
]

export function Home() {
  const [sort, setSort] = useState<TokenSort>('new')
  const [search, setSearch] = useState('')
  const backend = useBackend()
  const [page] = usePoll(() => (backend ? backend.listTokens({ sort, search: search || undefined, limit: 24 }) : Promise.resolve(undefined)), 15000, [backend, sort, search])
  const loading = page === undefined
  const [status] = useBackendQuery(async (b) => b.status, [])

  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <div className="hero-eyebrow rise" style={{ animationDelay: '40ms' }}><ProtectedBadge label="pump.fun launchpad" /></div>
          <h1 className="hero-title rise" style={{ animationDelay: '120ms' }}>NO MORE<br /><span className="green-text">BLOCK ZEROS.</span></h1>
          <ul className="hero-claims rise" style={{ animationDelay: '220ms' }}>
            <li><Icon kind="check" size={20} />Max 1% / {RULES.MAX_DEV_BUY_SOL} SOL dev buy</li>
            <li><Icon kind="check" size={20} />Dev can't bundle block zero</li>
            <li><Icon kind="check" size={20} />No vamps. One ticker, one coin.</li>
          </ul>
          <div className="hero-ctas rise" style={{ animationDelay: '320ms' }}>
            <Link to="/launch" className="btn btn-green btn-lg">Launch a coin</Link>
            <Link to="/rules" className="btn btn-ghost btn-lg">The rules</Link>
          </div>
          <p className="hero-tag rise" style={{ animationDelay: '400ms' }}>Every token born from CONDOM is a better coin.</p>
        </div>
        <div className="hero-art rise" style={{ animationDelay: '160ms' }}>
          <img className="hero-pack" src="/img/hero-pack.webp" width={730} height={693} alt="A blister pack of green CONDOMs, one torn open" />
          <Seal className="hero-sticker" />
        </div>
      </section>

      <section className="container rules-strip">
        {CLAIMS.map((r, i) => (
          <Reveal key={r.k} delay={i * 70} className="rule-tile glass">
            <div className="rule-k">{r.k}</div>
            <div className="rule-v">{r.v}</div>
          </Reveal>
        ))}
      </section>

      <section className="container section" id="coins">
        <div className="section-head">
          <div>
            <h2>Born on CONDOM</h2>
          </div>
          <div className="toolbar">
            <div className="seg" role="tablist">
              {SORTS.map((s) => (
                <button key={s.id} role="tab" aria-selected={sort === s.id} className={sort === s.id ? 'on' : ''} onClick={() => setSort(s.id)}>{s.label}</button>
              ))}
            </div>
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ticker" />
            </label>
          </div>
        </div>

        {loading ? (
          <div className="grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="token-card glass skeleton" />)}</div>
        ) : page && page.items.length > 0 ? (
          <div className="grid">{page.items.map((t, i) => <Reveal key={t.mint} delay={i * 40}><TokenCard t={t} /></Reveal>)}</div>
        ) : (
          <div className="glass empty-wrap">
            <EmptyState
              title={search ? 'No coins match that.' : 'Nothing born yet.'}
              body={search ? 'Try another name or ticker.' : status === 'not-connected' ? 'Launches open soon.' : 'Be the first.'}
              action={!search && <Link to="/launch" className="btn btn-green">Start a launch</Link>}
            />
          </div>
        )}
      </section>

      <section className="container section">
        <Reveal className="compare glass">
          <div className="compare-head">
            <h2>Same curve. <span className="green-text">Better birth.</span></h2>
            <p className="muted">Real pump.fun coins. Cleaner start.</p>
          </div>
          <div className="compare-table">
            <div className="ct-row ct-h"><span /><span>Raw launch</span><span className="green-text">CONDOM</span></div>
            <div className="ct-row"><span>Dev buy in block 0</span><span className="dim">Allowed</span><span>Never</span></div>
            <div className="ct-row"><span>Dev buy size</span><span className="dim">Unlimited</span><span>Max {RULES.MAX_DEV_BUY_SOL} SOL (≈1%)</span></div>
            <div className="ct-row"><span>Bundle tools</span><span className="dim">Everywhere</span><span>None</span></div>
            <div className="ct-row"><span>Copycat tickers</span><span className="dim">Allowed</span><span>Blocked</span></div>
          </div>
        </Reveal>
      </section>
    </>
  )
}
