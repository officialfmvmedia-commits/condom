/**
 * Launch transaction builder: DOCUMENTED STUB. Nothing here signs or sends.
 *
 * What it must do once implemented (pump.fun wrapper approach):
 *   1. Upload metadata (name, symbol, description, image, socials) to IPFS, e.g. pump.fun's
 *      /api/ipfs endpoint or our own pinning, and get back a metadata URI.
 *   2. Build ONE transaction containing, in order:
 *        a. ComputeBudget instructions (priority fee).
 *        b. pump.fun program `create` (program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P) with a
 *           fresh mint keypair generated client-side, the creator as signer.
 *        c. pump.fun `buy` for the creator, with `amount` derived from devBuySol via the curve
 *           (see ../curve.ts) and maxSolCost = devBuySol * (1 + slippage).
 *      Alternative: request the same create+buy tx from PumpPortal's local transaction API
 *      (trade-local, action "create") and validate it before signing.
 *   3. Enforce, before handing the tx to the wallet:
 *        - devBuySol <= RULES.MAX_DEV_BUY_SOL (hard reject, never clamp silently).
 *        - exactly two signers: the creator and the new mint keypair.
 *        - exactly one buy instruction and its buyer == creator (no side-wallet buys in the tx).
 *        - no Jito tip instruction and no extra transfers out of the creator.
 *   4. Partially sign with the mint keypair, request the creator's signature, send, confirm,
 *      then register the mint with the CONDOM indexer so it shows as born-from-CONDOM.
 *
 * What it cannot do: stop anyone from buying through pump.fun directly in the same block.
 * That is what the Launch Report is for: it names those wallets publicly.
 */
import { RULES } from '../rules'
import { NotImplementedError, type LaunchParams } from './types'

export interface UnsignedLaunch {
  /** Serialized v0 transaction, base64. */
  transaction: string
  mint: string
}

export function assertLaunchParams(p: LaunchParams): void {
  if (!(p.devBuySol >= 0)) throw new Error('Dev buy must be zero or more.')
  if (p.devBuySol > RULES.MAX_DEV_BUY_SOL + 1e-9) {
    throw new Error(`Dev buy is capped at ${RULES.MAX_DEV_BUY_SOL} SOL.`)
  }
  if (!p.name.trim() || !p.symbol.trim()) throw new Error('Name and ticker are required.')
}

export async function buildLaunchTransaction(p: LaunchParams, _creator: string): Promise<UnsignedLaunch> {
  assertLaunchParams(p)
  throw new NotImplementedError('The launch transaction builder')
}
