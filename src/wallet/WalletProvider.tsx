import { useMemo, type ReactNode } from 'react'
import { ConnectionProvider, WalletProvider as AdapterWalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { WalletModalProvider } from './WalletModal'

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com'

/** Phantom + Solflare adapters; Backpack (and any other Wallet Standard wallet) is detected automatically. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const endpoint = import.meta.env.VITE_SOLANA_RPC || DEFAULT_RPC
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])
  return (
    <ConnectionProvider endpoint={endpoint}>
      <AdapterWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </AdapterWalletProvider>
    </ConnectionProvider>
  )
}
