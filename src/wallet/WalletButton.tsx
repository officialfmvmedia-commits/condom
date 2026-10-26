import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from './WalletModal'
import { shortAddr } from '../lib/format'

export function WalletButton() {
  const { publicKey, wallet, disconnect, connecting } = useWallet()
  const { open } = useWalletModal()
  const [menu, setMenu] = useState(false)
  if (!publicKey) {
    return <button className="btn btn-glass" onClick={open}>{connecting ? 'Connecting…' : 'Connect'}</button>
  }
  const addr = publicKey.toBase58()
  return (
    <div className="wallet-btn-wrap">
      <button className="btn btn-glass" onClick={() => setMenu((m) => !m)}>
        {wallet && <img src={wallet.adapter.icon} alt="" className="wallet-ico" />}
        <span className="mono">{shortAddr(addr)}</span>
      </button>
      {menu && (
        <div className="menu glass" onMouseLeave={() => setMenu(false)}>
          <button onClick={() => { navigator.clipboard?.writeText(addr); setMenu(false) }}>Copy address</button>
          <button onClick={() => { disconnect(); setMenu(false) }}>Disconnect</button>
        </div>
      )}
    </div>
  )
}
