import { Link } from 'react-router-dom'
import { Reveal } from '../components/Reveal'
import { Icon, ProtectedBadge } from '../components/Brand'
import { RULES } from '../lib/rules'
import { CURVE, supplyPctForFirstBuy, tokensForFirstBuy } from '../lib/curve'
import { fmtNum } from '../lib/format'

export function Rules() {
  const capPct = supplyPctForFirstBuy(RULES.MAX_DEV_BUY_SOL)
  const capTokens = tokensForFirstBuy(RULES.MAX_DEV_BUY_SOL)
  return (
    <section className="container section rules">
      <div className="page-head rise">
        <ProtectedBadge size="sm" label="How it works" />
        <h1>Protection, explained plainly.</h1>
        <p className="muted lead">
          CONDOM launches real pump.fun coins with rules on top. Some things we enforce. Some things we can't stop, so we expose them.
          Here is exactly which is which.
        </p>
      </div>

      <div className="rules-cols">
        <Reveal className="glass card rules-block">
          <div className="rb-head"><span className="rb-ico ok">✓</span><h2>What we enforce</h2></div>
          <p className="muted">Built into the transactions CONDOM builds. If a launch breaks these, CONDOM won't build it.</p>
          <ol className="rules-list">
            <li><b>The dev never buys in block 0.</b> The create transaction CONDOM builds has no buy in it. That's NO MORE BLOCK ZEROES.</li>
            <li><b>Dev buy unlocks after block 0.</b> Your one optional buy can only go out once the chain is {RULES.DEV_BUY_MIN_SLOTS_AFTER_CREATE} slots past the creation slot. You'll see a short countdown, about a second.</li>
            <li><b>Dev buy capped at {RULES.MAX_DEV_BUY_SOL} SOL.</b> On a fresh pump.fun curve that's about {fmtNum(capTokens, 0)} tokens, ≈{capPct.toFixed(2)}% of supply. That's our MAX 1% DEV BUY. If others bought first, you get a little less.</li>
            <li><b>A clean create.</b> The only signers are you and the new mint. No buys, no side wallets, no tips to bundle services.</li>
            <li><b>Born here, sealed here.</b> Only coins launched through this flow carry the Protected seal.</li>
          </ol>
        </Reveal>

        <Reveal className="glass card rules-block" delay={80}>
          <div className="rb-head"><span className="rb-ico eye">◉</span><h2>What we expose</h2></div>
          <p className="muted">Read from the chain and published in every coin's Launch Report.</p>
          <ol className="rules-list">
            <li><b>Proof the dev sat out block 0.</b> The report checks the dev's first buy landed after the creation slot.</li>
            <li><b>Outside block-0 buyers.</b> Every other wallet that bought in the same block as the launch, by name, with how much they got.</li>
            <li><b>Early buyers.</b> Everyone who bought in the launch block plus the next {RULES.REPORT_WINDOW_SLOTS} blocks.</li>
            <li><b>Dev-funded wallets.</b> Early buyers that received SOL straight from the dev wallet before buying. That's what a side wallet looks like.</li>
            <li><b>Same-slot bundles.</b> Early buys that paid bundle tips in the launch block.</li>
          </ol>
        </Reveal>
      </div>

      <Reveal className="glass card honest">
        <div className="rb-head"><span className="rb-ico warn">!</span><h2>What we can't do</h2></div>
        <div className="honest-grid">
          <div><b>We can't block outside snipers.</b><p className="muted">Coins born here are pump.fun coins, so anyone can buy them on pump.fun directly, even in block 0. NO MORE BLOCK ZEROES is a rule for the dev. Outsiders who snipe don't get blocked. They get named.</p></div>
          <div><b>The funding trace is one hop.</b><p className="muted">We flag wallets funded directly by the dev. SOL routed through extra wallets or an exchange can get past it. A clean report is evidence, not a guarantee.</p></div>
          <div><b>We don't pick winners.</b><p className="muted">A protected launch is a fairer start. It doesn't make a coin go up. Nothing here is financial advice.</p></div>
        </div>
      </Reveal>

      <Reveal className="glass card">
        <div className="card-label">Launch Report grades</div>
        <div className="grades">
          <div className="grade-row"><span className="grade-chip protected"><Icon kind="check" size={18} />PROTECTED</span><p>No dev buy in block 0, dev buy within the cap, nobody else buying inside the create transaction, no dev-funded early buyers, and block-0 outsiders hold under {RULES.BLOCK0_CAUTION_PCT}% of supply.</p></div>
          <div className="grade-row"><span className="grade-chip caution"><Icon kind="warn" size={18} />CAUTION</span><p>The dev played clean, but outsiders took {RULES.BLOCK0_CAUTION_PCT}% or more in block 0, or bundle tips showed up in the launch block. They're named in the report.</p></div>
          <div className="grade-row"><span className="grade-chip unprotected"><Icon kind="cross" size={18} />UNPROTECTED</span><p>The dev bought in block 0, went over the cap, let someone else buy inside the create transaction, or funded early buyers. Most coins launched elsewhere get this grade, because their dev buys in the create transaction.</p></div>
        </div>
      </Reveal>

      <Reveal className="faq">
        <h2>Questions</h2>
        <details className="glass"><summary>Why can't the dev buy in block 0?</summary><p className="muted">A block-0 dev buy is the cheapest seat in the house, taken before anyone else can see the coin. Making the dev wait until block 0 has passed puts the dev in line with everyone else.</p></details>
        <details className="glass"><summary>Why 0.3 SOL?</summary><p className="muted">pump.fun's curve starts with {CURVE.VIRTUAL_SOL} SOL and {fmtNum(CURVE.VIRTUAL_TOKENS, 0)} tokens in virtual reserves. {RULES.MAX_DEV_BUY_SOL} SOL on a fresh curve gets ≈{capPct.toFixed(2)}% of a 1B supply before fees, and less if others bought first. Enough skin in the game, not enough to dump on anyone.</p></details>
        <details className="glass"><summary>Is my coin a pump.fun coin?</summary><p className="muted">Yes. It trades on the pump.fun bonding curve and graduates the same way. CONDOM controls how it's born and reports on its first blocks.</p></details>
        <details className="glass"><summary>Can I run a report on a coin launched elsewhere?</summary><p className="muted">The analyzer works on any pump.fun mint. Coins launched elsewhere can still get a report, but they never carry the seal.</p></details>
        <details className="glass"><summary>Does CONDOM hold my keys or funds?</summary><p className="muted">No. Your wallet signs the launch. CONDOM builds the transaction and checks it against the rules before you sign.</p></details>
      </Reveal>

      <div className="rules-cta">
        <h2>Every token born from CONDOM is a <span className="green-text">better coin.</span></h2>
        <Link to="/launch" className="btn btn-green btn-lg">Launch a protected coin</Link>
      </div>
    </section>
  )
}
