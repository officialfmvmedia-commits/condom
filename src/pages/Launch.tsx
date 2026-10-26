import { useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '../wallet/WalletModal'
import { TokenCard } from '../components/TokenCard'
import { Icon } from '../components/Brand'
import { RULES, LIMITS } from '../lib/rules'
import { supplyPctForFirstBuy } from '../lib/curve'
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
  const [devBuyText, setDevBuyText] = useState('0.1')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [drag, setDrag] = useState(false)
  const [launched, setLaunched] = useState<LaunchResult | null>(null)
  const [devBought, setDevBought] = useState(false)
  const gate = useSlotGate(launched?.slot ?? null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  const parsed = parseFloat(devBuyText)
  const devBuy = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  const overCap = devBuy > RULES.MAX_DEV_BUY_SOL + 1e-9
  const pct = supplyPctForFirstBuy(devBuy)
  const fill = Math.min(100, (devBuy / RULES.MAX_DEV_BUY_SOL) * 100)
  const ready = name.trim().length > 0 && symbol.trim().length > 0

  const onFile = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setNotice({ tone: 'error', text: 'That file is not an image.' })
    if (f.size > LIMITS.IMAGE_MAX_BYTES) return setNotice({ tone: 'error', text: 'Images must be 4 MB or smaller.' })
    setNotice(null)
    setImage(f)
    setImageUrl(URL.createObjectURL(f))
  }

  const onDevBuyText = (v: string) => setDevBuyText(v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 8))

  const preview = useMemo(() => ({
    mint: 'preview', name: name || 'Your coin', symbol: symbol || 'TICKER', imageUrl,
    description: description || undefined, creator: wallet.publicKey?.toBase58() ?? 'you', createdAt: Date.now(),
    curveProgress: 0, devBuyPct: overCap ? undefined : pct,
  }), [name, symbol, imageUrl, description, wallet.publicKey, pct])

  const submit = async () => {
    setNotice(null)
    if (overCap) return
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
    if (!backend || !launched || !gate.unlocked || devBuy <= 0 || overCap) return
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
        <h1>Launch a coin</h1>
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

          <div className={`glass card rise ${overCap ? 'devbuy-over' : ''}`} style={{ animationDelay: '120ms' }}>
            <div className="card-label">Dev buy <span className="dim small-note">optional</span><span className="cap-chip">Max {RULES.MAX_DEV_BUY_SOL} SOL</span></div>
            <div className="devbuy-readout">
              <div className="devbuy-sol">
                <input
                  className="mono"
                  type="text" inputMode="decimal"
                  value={devBuyText}
                  style={{ width: `${Math.max(2, devBuyText.length) * 0.8 + 0.3}ch` }}
                  onChange={(e) => onDevBuyText(e.target.value)}
                  aria-label="Dev buy in SOL"
                  aria-invalid={overCap}
                  aria-describedby="devbuy-hint"
                  disabled={devBought}
                />
                <span>SOL</span>
              </div>
              <div className="devbuy-pct">
                <div className="mono big">{overCap ? '>1%' : `≈${pct.toFixed(2)}%`}</div>
                <div className="dim">of supply</div>
              </div>
            </div>
            <div className="slider-wrap" style={{ ['--fill' as string]: `${fill}%` }}>
              <input
                type="range" min={0} max={RULES.MAX_DEV_BUY_SOL} step={RULES.DEV_BUY_STEP_SOL}
                value={Math.min(devBuy, RULES.MAX_DEV_BUY_SOL)} onChange={(e) => setDevBuyText(e.target.value)}
                aria-label="Dev buy slider" disabled={devBought}
              />
              <div className="slider-ticks mono dim"><span>0</span><span>0.1</span><span>0.2</span><span className="green-text">0.3 max</span></div>
            </div>
            {overCap
              ? <p id="devbuy-hint" className="field-error" role="alert"><Icon kind="warn" size={18} />Max dev buy is {RULES.MAX_DEV_BUY_SOL} SOL (≈1%). Lower it to launch.</p>
              : <p id="devbuy-hint" className="fine dim">Goes in after block zero{launched && step === 2 && gate.slotsLeft != null ? ` · unlocks in ~${((gate.slotsLeft * RULES.APPROX_SLOT_MS) / 1000).toFixed(1)}s` : '.'}</p>}
            {launched && devBuy > 0 && (
              <button type="button" className="btn btn-green btn-block devbuy-go" disabled={!gate.unlocked || busy || overCap || devBought} onClick={devBuyNow}>
                {devBought ? 'Dev buy sent' : gate.unlocked ? `Buy ${devBuy} SOL` : 'Waiting for block zero to pass…'}
              </button>
            )}
          </div>

          {notice && <div className={`notice ${notice.tone}`} role="status"><Icon kind={notice.tone === 'error' ? 'warn' : 'info'} size={18} />{notice.text}</div>}

          <button className="btn btn-green btn-lg btn-block rise" style={{ animationDelay: '180ms' }} type="submit" disabled={busy || !!launched || overCap}>
            {overCap ? `Dev buy over ${RULES.MAX_DEV_BUY_SOL} SOL` : busy && !launched ? 'Preparing…' : launched ? 'Coin created' : wallet.publicKey ? 'Launch' : 'Connect wallet to launch'}
          </button>
        </form>

        <aside className="launch-side">
          <div className="rise" style={{ animationDelay: '100ms' }}>
            <div className="side-label">Preview</div>
            <TokenCard t={preview} preview />
          </div>
          <div className="glass card enforces rise" style={{ animationDelay: '160ms' }}>
            <ul className="enforce-list">
              <li><Check /><b>No dev buy in block zero</b></li>
              <li><Check /><b>Max 1% / {RULES.MAX_DEV_BUY_SOL} SOL dev buy</b></li>
              <li><Check /><b>No bundle tools</b></li>
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
