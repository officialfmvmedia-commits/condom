import { Connection, PublicKey, SendTransactionError, type VersionedTransaction } from '@solana/web3.js'
import { RPC_URL } from '../config'
import { ApiError, checkTicker, confirmTicker, getCoin, listCoins, reserveTicker, uploadMetadata } from '../registry'
import {
  assertCleanCreate, assertCleanDevBuy, assertDevBuyAmount, assertLaunchParams, buildCreateTx, buildDevBuyTx,
} from './launchTxBuilder'
import type { LaunchpadBackend, LaunchParams, LaunchResult, StepFn, TokenSummary, WalletSigner } from './types'
import { NotImplementedError } from './types'

/**
 * Real mainnet backend. Everything is built in the browser and signed by the connected wallet:
 * no server keys, no Jito/bundle tips, no extra signers besides the fresh mint keypair.
 *   launch: reserve ticker (wallet signs a message) -> metadata to IPFS -> create_v2 with NO buy -> confirm
 *   devBuy: separate tx, only after creation slot + 2, capped at 0.3 SOL (enforced by the builder)
 */
export function createLiveBackend(rpcUrl = RPC_URL): LaunchpadBackend {
  const conn = new Connection(rpcUrl, { commitment: 'confirmed' })

  return {
    id: 'pump.fun',
    status: 'live',

    async launch(params: LaunchParams, signer: WalletSigner, onStep: StepFn = () => {}): Promise<LaunchResult> {
      assertLaunchParams(params)
      assertDevBuyAmount(params.devBuySol)
      if (!params.image) throw new Error('Add an image for your coin.')
      const creator = new PublicKey(signer.publicKey.toBase58())
      const creatorStr = creator.toBase58()
      const symbol = params.symbol.trim().toUpperCase()

      onStep('Checking ticker…')
      const status = await checkTicker(symbol, creatorStr)
      if (!status.available) {
        throw new Error(status.status === 'live' ? `$${symbol} is taken by ${status.coin.name}. No vamps.` : `$${symbol} is reserved by another wallet. Try again in a few minutes.`)
      }
      if (!signer.signMessage) throw new Error("Your wallet can't sign messages. Use Phantom or Solflare.")
      onStep('Approve the ticker reservation in your wallet…')
      await walletStep(() => reserveTicker(symbol, creatorStr, signer.signMessage!.bind(signer)))

      onStep('Uploading image and metadata…')
      const { metadataUri } = await uploadMetadata({
        image: params.image, name: params.name.trim(), symbol, description: params.description.trim(),
        twitter: params.socials.x?.trim(), telegram: params.socials.telegram?.trim(), website: params.socials.website?.trim(),
      })

      onStep('Building the create transaction (no buy)…')
      const built = await buildCreateTx(conn, { creator, name: params.name.trim(), symbol, uri: metadataUri })

      onStep('Approve the launch in your wallet…')
      const signed = await walletStep(() => signer.signTransaction(built.tx))
      assertCleanCreate(signed, creator, built.mint.publicKey)
      signed.sign([built.mint])

      onStep('Sending…')
      const { signature, slot } = await sendAndConfirm(conn, signed, built.lastValidBlockHeight, onStep)
      const mint = built.mint.publicKey.toBase58()

      onStep('Registering ticker…')
      let registryWarning: string | undefined
      for (let i = 0; i < 4; i++) {
        try {
          await confirmTicker(symbol, creatorStr, mint, signature)
          registryWarning = undefined
          break
        } catch (e) {
          registryWarning = `Coin is live, but the ticker registry didn't update: ${e instanceof Error ? e.message : e}`
          if (e instanceof ApiError && e.status === 409) break
          await sleep(2000)
        }
      }
      return { mint, signature, slot, registryWarning }
    },

    async devBuy(p, signer, onStep: StepFn = () => {}) {
      const creator = new PublicKey(signer.publicKey.toBase58())
      onStep('Building the dev buy…')
      const built = await buildDevBuyTx(conn, {
        creator, mint: new PublicKey(p.mint), sol: p.sol, creationSlot: p.creationSlot, slippagePct: p.slippageBps / 100,
      })
      onStep('Approve the dev buy in your wallet…')
      const signed = await walletStep(() => signer.signTransaction(built.tx))
      assertCleanDevBuy(signed, creator)
      onStep('Sending…')
      const { signature } = await sendAndConfirm(conn, signed, built.lastValidBlockHeight, onStep)
      return { signature }
    },

    async buy() { throw new NotImplementedError('Trading here') },
    async sell() { throw new NotImplementedError('Trading here') },

    async listTokens(q) {
      let items: TokenSummary[] = await listCoins(q.limit ?? 60).catch(() => [])
      if (q.search) {
        const s = q.search.toLowerCase()
        items = items.filter((t) => t.name.toLowerCase().includes(s) || t.symbol.toLowerCase().includes(s) || t.mint === q.search)
      }
      return { items }
    },
    async getToken(mint) { return getCoin(mint).catch(() => null) },
    async getTrades() { return [] },
    async getHolders() { return [] },
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Turns wallet rejections into a plain message. */
async function walletStep<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/reject|denied|cancel|declined/i.test(msg)) throw new Error('You cancelled in your wallet. Nothing was sent.')
    throw e
  }
}

/** Sends, re-broadcasts every 2s, and waits for `confirmed`. Returns the landing slot. */
export async function sendAndConfirm(
  conn: Connection, tx: VersionedTransaction, lastValidBlockHeight: number, onStep: StepFn = () => {},
): Promise<{ signature: string; slot: number }> {
  const raw = tx.serialize()
  let signature: string
  try {
    signature = await conn.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 })
  } catch (e) {
    throw new Error(explainSendError(e))
  }
  onStep('Waiting for confirmation…')
  const started = Date.now()
  for (;;) {
    const { value } = await conn.getSignatureStatuses([signature])
    const st = value[0]
    if (st?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(st.err)}. Signature ${signature}`)
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return { signature, slot: st.slot }
    const height = await conn.getBlockHeight('confirmed').catch(() => 0)
    if (height > lastValidBlockHeight) throw new Error('Transaction expired before it landed. Nothing was charged. Try again.')
    if (Date.now() - started > 90_000) throw new Error(`Still not confirmed after 90s. Check ${signature} on Solscan before retrying.`)
    conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {})
    await sleep(2000)
  }
}

export function explainSendError(e: unknown): string {
  const logs = e instanceof SendTransactionError ? (e.logs ?? []) : []
  const msg = e instanceof Error ? e.message : String(e)
  const all = msg + '\n' + logs.join('\n')
  if (/insufficient (funds|lamports)|0x1\b|Attempt to debit an account but found no record/i.test(all)) return 'Not enough SOL in your wallet for this transaction and fees.'
  if (/TooMuchSolRequired|slippage|0x1772|6002/i.test(all)) return 'Price moved past your slippage. Raise slippage or try again.'
  if (/blockhash not found|BlockhashNotFound/i.test(all)) return 'Network was busy (blockhash expired). Try again.'
  if (/403|429|Too many requests|forbidden/i.test(all)) return 'The network is busy right now. Wait a few seconds and try again.'
  const last = logs.filter((l) => /Error|failed/i.test(l)).slice(-1)[0]
  return `Transaction rejected: ${last ?? msg}`.slice(0, 300)
}
