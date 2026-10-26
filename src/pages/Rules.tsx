import { Link } from 'react-router-dom'
import { Reveal } from '../components/Reveal'
import { ProtectedBadge } from '../components/Brand'
import { RULES } from '../lib/rules'

const THREE = [
  { k: 'No more block zeros.', v: 'The dev never buys block zero.' },
  { k: `Max 1% / ${RULES.MAX_DEV_BUY_SOL} SOL dev buy.`, v: "Over the cap, the launch won't go." },
  { k: "Dev can't bundle block zero.", v: 'No bundle tools. None.' },
  { k: 'No vamps. One ticker, one coin.', v: 'Once a ticker is born here, copycats (even lookalike spellings) are blocked.' },
]

export function Rules() {
  return (
    <section className="container section rules">
      <div className="page-head rise">
        <ProtectedBadge size="sm" label="The rules" />
        <h1>Four rules.</h1>
      </div>

      <ol className="three">
        {THREE.map((r, i) => (
          <Reveal key={r.k} delay={i * 70} className="glass three-item">
            <span className="three-n">{i + 1}</span>
            <div><b>{r.k}</b><span className="muted">{r.v}</span></div>
          </Reveal>
        ))}
      </ol>

      <p className="muted three-note">Coins launched here are normal pump.fun tokens.</p>

      <div className="rules-cta">
        <h2>Every token born from CONDOM is a <span className="green-text">better coin.</span></h2>
        <Link to="/launch" className="btn btn-green btn-lg">Launch a coin</Link>
      </div>
    </section>
  )
}
