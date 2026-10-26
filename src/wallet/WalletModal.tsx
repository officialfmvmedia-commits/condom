import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base'
import { Logo } from '../components/Brand'

const Ctx = createContext<{ open: () => void }>({ open: () => {} })
export const useWalletModal = () => useContext(Ctx)

const FEATURED: { name: string; url: string }[] = [
  { name: 'Phantom', url: 'https://phantom.com/download' },
  { name: 'Solflare', url: 'https://solflare.com/download' },
  { name: 'Backpack', url: 'https://backpack.app/download' },
]

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {isOpen && <WalletModal onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  )
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const { wallets, select, connect, wallet, connected } = useWallet()
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => { if (connected) onClose() }, [connected, onClose])
  useEffect(() => {
    if (pending && wallet?.adapter.name === pending) connect().catch(() => setPending(null))
  }, [pending, wallet, connect])

  const rows = FEATURED.map((f) => {
    const w = wallets.find((x) => x.adapter.name === f.name)
    const installed = w && (w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable)
    return { ...f, icon: w?.adapter.icon, installed: !!installed }
  })
  const others = wallets.filter((w) => !FEATURED.some((f) => f.name === w.adapter.name) && w.readyState === WalletReadyState.Installed)

  const choose = (name: string) => { setPending(name); select(name as WalletName) }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal glass" role="dialog" aria-modal="true" aria-label="Connect a wallet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Logo size={44} />
          <div>
            <h3>Connect a wallet</h3>
            <p className="muted">CONDOM never holds your keys.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="wallet-list">
          {rows.map((r) => r.installed ? (
            <button key={r.name} className="wallet-row" onClick={() => choose(r.name)} disabled={pending === r.name}>
              {r.icon ? <img src={r.icon} alt="" /> : <span className="wallet-dot" />}
              <span>{r.name}</span>
              <span className="pill pill-green">{pending === r.name ? 'Connecting…' : 'Detected'}</span>
            </button>
          ) : (
            <a key={r.name} className="wallet-row" href={r.url} target="_blank" rel="noreferrer">
              {r.icon ? <img src={r.icon} alt="" /> : <span className="wallet-dot" />}
              <span>{r.name}</span>
              <span className="pill">Install ↗</span>
            </a>
          ))}
          {others.map((w) => (
            <button key={w.adapter.name} className="wallet-row" onClick={() => choose(w.adapter.name)}>
              <img src={w.adapter.icon} alt="" />
              <span>{w.adapter.name}</span>
              <span className="pill pill-green">Detected</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
