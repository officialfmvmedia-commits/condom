/**
 * Launch transaction builders: DOCUMENTED STUBS. Nothing here signs or sends.
 *
 * Core rule, NO MORE BLOCK ZEROES: the dev never buys in block 0 (the creation slot).
 * So a CONDOM launch is two separate transactions:
 *
 * 1. CREATE (no buy)
 *    - Upload metadata (name, symbol, description, image, socials) to IPFS (pump.fun's /api/ipfs or
 *      our own pinning) and get a metadata URI.
 *    - Build ONE transaction: ComputeBudget ixs + pump.fun `create_v2`
 *      (program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P) with a fresh client-side mint keypair.
 *      Alternative: PumpPortal trade-local "create" with amount 0, then validate before signing.
 *    - Validate before handing to the wallet (assertCleanCreate):
 *        * exactly two signers: creator + mint keypair
 *        * NO pump.fun buy/sell instruction of any kind (no dev buy, no side-wallet buy)
 *        * no Jito tip transfer, no SOL transfers from the creator to other wallets
 *    - Send, confirm, record the creation slot from the confirmed tx.
 *
 * 2. DEV BUY (optional, after block 0)
 *    - Unlocks only when getSlot('confirmed') >= creationSlot + RULES.DEV_BUY_MIN_SLOTS_AFTER_CREATE.
 *      The UI shows a countdown; the builder re-checks the slot itself (assertDevBuyAllowed) so the
 *      gate can't be skipped by calling the backend directly.
 *    - Build pump.fun `buy` for the creator: amount from the CURRENT curve state (outsiders may have
 *      bought in block 0, so the dev gets fewer tokens than on a fresh curve), maxSolCost =
 *      sol * (1 + slippage), sol <= RULES.MAX_DEV_BUY_SOL.
 *    - One dev buy per launch through CONDOM.
 *
 * What this can't do: stop anyone else buying through pump.fun directly in block 0.
 * The Launch Report names those wallets and verifies the dev's own first buy came after block 0.
 */
import { RULES } from '../rules'
import { NotImplementedError, type LaunchParams, type DevBuyParams } from './types'

export interface UnsignedTx {
  /** Serialized v0 transaction, base64. */
  transaction: string
}

export interface UnsignedCreate extends UnsignedTx {
  mint: string
}

export function assertLaunchParams(p: LaunchParams): void {
  if (!p.name.trim() || !p.symbol.trim()) throw new Error('Name and ticker are required.')
  assertDevBuyAmount(p.devBuySol)
}

export function assertDevBuyAmount(sol: number): void {
  if (!(sol >= 0)) throw new Error('Dev buy must be zero or more.')
  if (sol > RULES.MAX_DEV_BUY_SOL + 1e-9) throw new Error(`Dev buy is capped at ${RULES.MAX_DEV_BUY_SOL} SOL.`)
}

/** First slot at which the dev buy may be sent. */
export const devBuyUnlockSlot = (creationSlot: number) => creationSlot + RULES.DEV_BUY_MIN_SLOTS_AFTER_CREATE

export function assertDevBuyAllowed(p: DevBuyParams, currentSlot: number): void {
  assertDevBuyAmount(p.sol)
  if (p.sol === 0) throw new Error('Nothing to buy.')
  if (currentSlot < devBuyUnlockSlot(p.creationSlot)) {
    throw new Error(`Dev buy unlocks after block 0 (slot ${devBuyUnlockSlot(p.creationSlot)}); chain is at ${currentSlot}.`)
  }
}

/** Builds the create-only transaction (no buy). Stub. */
export async function buildCreateTransaction(p: LaunchParams, _creator: string): Promise<UnsignedCreate> {
  assertLaunchParams(p)
  throw new NotImplementedError('The create transaction builder')
}

/** Builds the dev's capped buy, only after block 0. Stub. */
export async function buildDevBuyTransaction(p: DevBuyParams, currentSlot: number, _creator: string): Promise<UnsignedTx> {
  assertDevBuyAllowed(p, currentSlot)
  throw new NotImplementedError('The dev buy transaction builder')
}
