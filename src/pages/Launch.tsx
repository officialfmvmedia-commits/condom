import { useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '../wallet/WalletModal'
import { TokenCard } from '../components/TokenCard'
import { Mark, ProtectedBadge } from '../components/Brand'
import { RULES, LIMITS } from '../lib/rules'
import { CURVE, supplyPctForFirstBuy, tokensForFirstBuy } from '../lib/curve'
import { fmtNum } from '../lib/format'
import { useBackend } from '../lib/useBackend'
import { NotImplementedError, type LaunchParams, type LaunchResult, type WalletSigner } from '../lib/launchpad/types'
import { useSlotGate } from '../lib/useSlotGate'

type Notice = { tone: 'info' | 'error'; text: string } | null

export function Launch() {
  const backend = useBackend()
  const wallet = useWallet()
  const { open } = useWalletModal()
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [socials, setSocials] = useState({ x: '', telegram: '', website: '' })
  const [showSocials, setShowSocials] = useState(false)
  const [devBuy, setDevBuy] = useState(0.1)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [drag, setDrag] = useState(false)
  const [launched, setLaunched] = useState<LaunchResult | null>(null)
  const [devBought, setDevBought] = useState(false)
  const gate = useSlotGate(launched?.slot ?? null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  const pct = supplyPctForFirstBuy(devBuy)
  const tokens = tokensForFirstBuy(devBuy)
  const capPct = supplyPctForFirstBuy(RULES.MAX_DEV_BUY_SOL)
  const fill = (devBuy / RULES.MAX_DEV_BUY_SOL) * 100
  const ready = name.trim().length > 0 && symbol.trim().length > 0

  const onFile = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setNotice({ tone: 'error', text: 'That file is not an image.' })
    if (f.size > LIMITS.IMAGE_MAX_BYTES) return setNotice({ tone: 'error', text: 'Images must be 4 MB or smaller.' })
    setNotice(null)
    setImage(f)
    setImageUrl(URL.createObjectURL(f))
  }

  const setDevBuyClamped = (v: number) => {
    const n = Number.isFinite(v) ? v : 0
    setDevBuy(Math.round(Math.min(RULES.MAX_DEV_BUY_SOL, Math.max(0, n)) * 100) / 100)
  }

  const preview = useMemo(() => ({
    mint: 'preview', name: name || 'Your coin', symbol: symbol || 'TICKER', imageUrl,
    description: description || undefined, creator: wallet.publicKey?.toBase58() ?? 'you', createdAt: Date.now(),
    curveProgress: 0, devBuyPct: pct, grade: 'PROTECTED' as const,
  }), [name, symbol, imageUrl, description, wallet.publicKey, pct])

  const submit = async () => {
    setNotice(null)
    if (!ready) return setNotice({ tone: 'error', text: 'Give your coin a name and a ticker.' })
    if (!wallet.publicKey || !wallet.signTransaction) return open()
    if (!backend) return
    const params: LaunchParams = { name: name.trim(), symbol: symbol.trim(), description: description.trim(), image, socials, devBuySol: devBuy }
    setBusy(true)
    try {
      setLaunched(await backend.launch(params, wallet as unknown as WalletSigner))
    } catch (e) {
      setNotice(e instanceof NotImplementedError
        ? { tone: 'info', text: "Launches aren't live yet. Nothing was signed or sent." }
        : { tone: 'error', text: e instanceof Error ? e.message : 'Launch failed.' })
    } finally {
      setBusy(false)
    }
  }

  const devBuyNow = async () => {
    if (!backend || !launched || !gate.unlocked || devBuy <= 0) return
    setBusy(true)
    try {
      await backend.devBuy({ mint: launched.mint, sol: devBuy, creationSlot: launched.slot, slippageBps: 500 }, wallet as unknown as WalletSigner)
      setDevBought(true)
    } catch (e) {
      setNotice({ tone: e instanceof NotImplementedError ? 'info' : 'error', text: e instanceof Error ? e.message : 'Dev buy failed.' })
    } finally {
      setBusy(false)
    }
  }
  const step = !launched ? 1 : !gate.unlocked ? 2 : 3

  return (
    <section className="container section launch">
      <div className="page-head rise">
        <ProtectedBadge size="sm" label="Protected launch" />
        <h1>Launch a coin</h1>
        <p className="muted">Create first. Block 0 passes. Then your capped buy unlocks.</p>
      </div>

      <div className="launch-grid">
        <form className="launch-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="glass card rise" style={{ animationDelay: '60ms' }}>
            <div className="card-label">Identity</div>
            <div className="identity">
              <button
                type="button"
                className={`dropzone ${drag ? 'drag' : ''} ${imageUrl ? 'has' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]) }}
              >
                {imageUrl ? <img src={imageUrl} alt="Token image preview" /> : (<><span className="dz-plus">+</span><span>Image</span></>)}
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <div className="identity-fields">
                <Field label="Name" count={`${name.length}/${LIMITS.NAME_MAX}`}>
                  <input value={name} maxLength={LIMITS.NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Better Coin" />
                </Field>
                <Field label="Ticker" count={`${symbol.length}/${LIMITS.TICKER_MAX}`}>
                  <div className="prefix-input"><span>$</span>
                    <input value={symbol} maxLength={LIMITS.TICKER_MAX} onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="BETTER" className="mono" />
                  </div>
                </Field>
              </div>
            </div>
            <Field label="Description" count={`${description.length}/${LIMITS.DESCRIPTION_MAX}`}>
              <textarea rows={3} value={description} maxLength={LIMITS.DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} placeholder="What's the coin about?" />
            </Field>
            <button type="button" className="disclosure" onClick={() => setShowSocials((s) => !s)} aria-expanded={showSocials}>
              <span>Socials</span><span className="dim">optional</span><span className={`chev ${showSocials ? 'up' : ''}`}>⌄</span>
            </button>
            <div className={`collapse ${showSocials ? 'open' : ''}`}>
              <div className="socials">
                <Field label="X"><input value={socials.x} onChange={(e) => setSocials({ ...socials, x: e.target.value })} placeholder="https://x.com/…" /></Field>
                <Field label="Telegram"><input value={socials.telegram} onChange={(e) => setSocials({ ...socials, telegram: e.target.value })} placeholder="https://t.me/…" /></Field>
                <Field label="Website"><input value={socials.website} onChange={(e) => setSocials({ ...socials, website: e.target.value })} placeholder="https://…" /></Field>
              </div>
            </div>
          </div>

          <div className="glass card rise" style={{ animationDelay: '120ms' }}>
            <div className="card-label">Dev buy <span className="dim small-note">optional</span><span className="cap-chip mono">HARD CAP {RULES.MAX_DEV_BUY_SOL} SOL</span></div>
            <div className="devbuy-readout">
              <div className="devbuy-sol">
                <input
                  className="mono"
                  type="number" inputMode="decimal" min={0} max={RULES.MAX_DEV_BUY_SOL} step={RULES.DEV_BUY_STEP_SOL}
                  value={devBuy}
                  style={{ width: `${Math.max(2, String(devBuy).length) + 0.4}ch` }}
                  onChange={(e) => setDevBuyClamped(parseFloat(e.target.value))}
                  aria-label="Dev buy in SOL"
                  disabled={devBought}
                />
                <span>SOL</span>
              </div>
              <div className="devbuy-pct">
                <div className="mono big">≤{pct.toFixed(2)}%</div>
                <div className="dim">of supply · up to {fmtNum(tokens, 0)} tokens</div>
              </div>
            </div>
            <div className="slider-wrap" style={{ ['--fill' as string]: `${fill}%` }}>
              <input
                type="range" min={0} max={RULES.MAX_DEV_BUY_SOL} step={RULES.DEV_BUY_STEP_SOL}
                value={devBuy} onChange={(e) => setDevBuyClamped(parseFloat(e.target.value))}
                aria-label="Dev buy slider" disabled={devBought}
              />
              <div className="slider-ticks mono dim"><span>0</span><span>0.1</span><span>0.2</span><span className="latex-text">0.3 max</span></div>
            </div>

            <ol className="b0-steps" aria-label="Launch sequence">
              <li className={step > 1 ? 'done' : step === 1 ? 'now' : ''}>
                <span className="b0-dot">{step > 1 ? '✓' : '1'}</span>
                <div><b>Create</b><span>Your coin goes live with no buy in it.</span></div>
              </li>
              <li className={step > 2 ? 'done' : step === 2 ? 'now' : ''}>
                <span className="b0-dot">{step > 2 ? '✓' : '2'}</span>
                <div><b>Block 0 passes</b><span>{step === 2 && gate.slotsLeft != null
                  ? <span className="mono latex-text">Unlocks in {gate.slotsLeft} slot{gate.slotsLeft === 1 ? '' : 's'} · ~{((gate.slotsLeft * RULES.APPROX_SLOT_MS) / 1000).toFixed(1)}s</span>
                  : `You sit out the creation slot plus ${RULES.DEV_BUY_MIN_SLOTS_AFTER_CREATE - 1} more. Anyone who buys in it gets named.`}</span></div>
              </li>
              <li className={devBought ? 'done' : step === 3 ? 'now' : ''}>
                <span className="b0-dot">{devBought ? '✓' : <LockIcon />}</span>
                <div><b>Dev buy unlocks after block 0</b><span>One buy, up to {RULES.MAX_DEV_BUY_SOL} SOL, signed separately.</span></div>
              </li>
            </ol>
            {launched && (
              <button type="button" className="btn btn-latex btn-block" disabled={!gate.unlocked || busy || devBuy <= 0 || devBought} onClick={devBuyNow}>
                {devBought ? 'Dev buy sent' : gate.unlocked ? `Buy ${devBuy} SOL now` : 'Locked until block 0 passes'}
              </button>
            )}
            <p className="fine dim">
              {RULES.MAX_DEV_BUY_SOL} SOL buys ≈{capPct.toFixed(2)}% on a fresh pump.fun curve ({CURVE.VIRTUAL_SOL} SOL / {fmtNum(CURVE.VIRTUAL_TOKENS, 0)} virtual reserves), before fees.
              If others buy in block 0 first, you get a little less. The cap and the wait are built into the transactions, not suggestions.
            </p>
          </div>

          {notice && <div className={`notice ${notice.tone}`} role="status"><Mark size={16} color="currentColor" />{notice.text}</div>}

          <button className="btn btn-latex btn-lg btn-block rise" style={{ animationDelay: '180ms' }} type="submit" disabled={busy || !!launched}>
            {busy && !launched ? 'Preparing…' : launched ? 'Coin created' : wallet.publicKey ? 'Create coin' : 'Connect wallet to launch'}
          </button>
        </form>

        <aside className="launch-side">
          <div className="rise" style={{ animationDelay: '100ms' }}>
            <div className="side-label">Preview</div>
            <TokenCard t={preview} preview />
          </div>
          <div className="glass card enforces rise" style={{ animationDelay: '160ms' }}>
            <div className="card-label">What CONDOM enforces</div>
            <ul className="enforce-list">
              <li><Check /> <div><b>No dev buy in block 0</b><span>The create transaction has no buy in it. Yours unlocks only after the creation slot has passed.</span></div></li>
              <li><Check /> <div><b>Dev buy ≤ {RULES.MAX_DEV_BUY_SOL} SOL</b><span>One buy, ≈1% of supply at most. Anything bigger can't be built.</span></div></li>
              <li><Check /> <div><b>Clean create</b><span>Only you and the new mint sign it. No buys, no side wallets, no tips to bundlers.</span></div></li>
              <li><Eye /> <div><b>Outside block-0 buyers get named</b><span>We can't stop people buying on pump.fun directly in block 0. Every one of them goes in the public Launch Report.</span></div></li>
              <li><Eye /> <div><b>Dev-funded wallets get flagged</b><span>Early buyers funded straight from your wallet show up as side wallets.</span></div></li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  )
}

function Field({ label, count, children }: { label: string; count?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-top"><span>{label}</span>{count && <span className="dim mono">{count}</span>}</span>
      {children}
    </label>
  )
}

const Check = () => <span className="li-ico ok">✓</span>
const Eye = () => <span className="li-ico eye">◉</span>
const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)
