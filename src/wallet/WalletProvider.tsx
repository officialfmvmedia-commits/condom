import { useMemo, type ReactNode } from 'react'
import { ConnectionProvider, WalletProvider as AdapterWalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { WalletModalProvider } from './WalletModal'
import { RPC_URL } from '../lib/config'

/** Phantom + Solflare adapters; Backpack (and any other Wallet Standard wallet) is detected automatically. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const endpoint = RPC_URL
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])
  return (
    <ConnectionProvider endpoint={endpoint}>
      <AdapterWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </AdapterWalletProvider>
    </ConnectionProvider>
  )
}
