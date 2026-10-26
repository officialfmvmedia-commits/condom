import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Seal, ProtectedBadge } from '../components/Brand'
import { TokenCard } from '../components/TokenCard'
import { EmptyState } from '../components/Empty'
import { Reveal } from '../components/Reveal'
import { useBackendQuery } from '../lib/useBackend'
import type { TokenSort } from '../lib/launchpad/types'
import { RULES } from '../lib/rules'
import { supplyPctForFirstBuy } from '../lib/curve'

const SORTS: { id: TokenSort; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'rising', label: 'Rising' },
  { id: 'graduating', label: 'Graduating' },
]

export function Home() {
  const [sort, setSort] = useState<TokenSort>('new')
  const [search, setSearch] = useState('')
  const [page, loading] = useBackendQuery((b) => b.listTokens({ sort, search: search || undefined, limit: 24 }), [sort, search])
  const [status] = useBackendQuery(async (b) => b.status, [])
  const capPct = supplyPctForFirstBuy(RULES.MAX_DEV_BUY_SOL)

  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow rise" style={{ animationDelay: '40ms' }}><ProtectedBadge size="sm" label="Fair launches" /><span>pump.fun inside, rules on top</span></div>
          <h1 className="hero-title rise" style={{ animationDelay: '120ms' }}>NO MORE<br /><span className="latex-text">BLOCK ZEROES.</span></h1>
          <p className="hero-sub rise" style={{ animationDelay: '220ms' }}>The dev can't buy block 0. Max {RULES.MAX_DEV_BUY_SOL} SOL after.</p>
          <p className="hero-body rise" style={{ animationDelay: '300ms' }}>
            Coins launch with no dev buy in them. The dev's one buy unlocks after block 0, capped at ≈1% of supply.
            Anyone else who snipes block 0 gets named in a public Launch Report.
          </p>
          <div className="hero-ctas rise" style={{ animationDelay: '380ms' }}>
            <Link to="/launch" className="btn btn-latex btn-lg">Launch a protected coin</Link>
            <Link to="/rules" className="btn btn-ghost btn-lg">How it works</Link>
          </div>
        </div>
        <div className="hero-art rise" style={{ animationDelay: '200ms' }}><Seal size={460} /></div>
      </section>

      <section className="container rules-strip">
        {[
          { k: `${RULES.MAX_DEV_BUY_SOL} SOL`, v: 'Max dev buy, hard cap' },
          { k: `≈${capPct.toFixed(0)}%`, v: 'Max dev share of supply' },
          { k: 'Block 0', v: 'Dev buys after it, never in it' },
          { k: 'Named', v: 'Every outside block-0 buyer, publicly' },
        ].map((r, i) => (
          <Reveal key={r.v} delay={i * 70} className="rule-tile glass">
            <div className="rule-k">{r.k}</div>
            <div className="rule-v">{r.v}</div>
          </Reveal>
        ))}
      </section>

      <section className="container section" id="coins">
        <div className="section-head">
          <div>
            <h2>Born on CONDOM</h2>
            <p className="muted">Every coin here carries the seal and a public Launch Report.</p>
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
              body={search ? 'Try another name or ticker.' : status === 'not-connected'
                ? 'Launches open soon. The first protected coin could be yours.'
                : 'Be the first protected launch.'}
              action={!search && <Link to="/launch" className="btn btn-latex">Start a launch</Link>}
            />
          </div>
        )}
      </section>

      <section className="container section">
        <Reveal className="compare glass">
          <div className="compare-head">
            <h2>Same curve. <span className="latex-text">Better birth.</span></h2>
            <p className="muted">Coins born here are real pump.fun tokens and graduate the same way. The difference is how they start.</p>
          </div>
          <div className="compare-table">
            <div className="ct-row ct-h"><span /><span>Raw launch</span><span className="latex-text">CONDOM launch</span></div>
            <div className="ct-row"><span>Dev buy in block 0</span><span className="dim">Allowed</span><span>Never</span></div>
            <div className="ct-row"><span>Dev buy size</span><span className="dim">Unlimited</span><span>Max {RULES.MAX_DEV_BUY_SOL} SOL (≈{capPct.toFixed(0)}%), after block 0</span></div>
            <div className="ct-row"><span>Side wallets in the create tx</span><span className="dim">Allowed</span><span>None. The create tx has no buys.</span></div>
            <div className="ct-row"><span>Outside block-0 snipers</span><span className="dim">Invisible</span><span>Named in the Launch Report</span></div>
            <div className="ct-row"><span>Wallets funded by the dev</span><span className="dim">Your problem</span><span>Traced and flagged</span></div>
          </div>
          <div className="compare-foot"><Link to="/rules" className="link">Read exactly what we enforce, and what we can't →</Link></div>
        </Reveal>
      </section>
    </>
  )
}
