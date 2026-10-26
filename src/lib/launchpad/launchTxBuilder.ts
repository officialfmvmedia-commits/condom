/**
 * CONDOM launch transactions: real pump.fun, built in the browser, signed by the creator's wallet.
 *
 * NO MORE BLOCK ZEROS: a CONDOM launch is two separate transactions.
 *
 * 1. CREATE (no buy): ComputeBudget + pump.fun `create_v2` (program 6EF8rrec…F6P, official
 *    @pump-fun/pump-sdk). Fresh mint keypair generated in the browser; it partial-signs, the creator's
 *    wallet signs. No buy, no Jito tip, no other signers. assertCleanCreate() re-checks this on the
 *    compiled message before it ever reaches the wallet.
 *
 * 2. DEV BUY (optional): only once the chain is >= creationSlot + RULES.DEV_BUY_MIN_SLOTS_AFTER_CREATE
 *    (re-checked here against the RPC, not just the UI). pump.fun `buy_exact_quote_in_v3`: spends AT
 *    MOST the quote amount, fees included (program-enforced), and the amount is hard-capped at
 *    RULES.MAX_DEV_BUY_SOL. assertCleanDevBuy() checks the compiled message.
 */
import BN from 'bn.js'
import {
  ComputeBudgetProgram, Keypair, PublicKey, TransactionMessage, VersionedTransaction,
  type Connection, type TransactionInstruction,
} from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { OnlinePumpSdk, PUMP_SDK, PUMP_PROGRAM_ID, getBuyV3TokenAmountFromQuoteAmount } from '@pump-fun/pump-sdk'
import { RULES } from '../rules'
import type { LaunchParams } from './types'

export const LAMPORTS_PER_SOL = 1_000_000_000
export const MAX_DEV_BUY_LAMPORTS = Math.round(RULES.MAX_DEV_BUY_SOL * LAMPORTS_PER_SOL)
export const CREATE_COMPUTE_UNITS = 270_000
export const BUY_COMPUTE_UNITS = 150_000
export const DEFAULT_PRIORITY_MICRO_LAMPORTS = 200_000

const COMPUTE_BUDGET = ComputeBudgetProgram.programId.toBase58()
const PUMP = PUMP_PROGRAM_ID.toBase58()
const SYSTEM = '11111111111111111111111111111111'
/** Lighthouse: assertion-only guard program Phantom injects into signed txs. It can only make a tx fail, never move funds. */
export const LIGHTHOUSE = 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'
const DISC = {
  create_v2: [214, 144, 76, 236, 95, 139, 49, 180],
  buy_exact_quote_in_v3: [225, 247, 80, 30, 213, 179, 132, 136],
}
export function readU64LE(d: Uint8Array, at: number): bigint {
  let v = 0n
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(d[at + i])
  return v
}
const hasDisc = (data: Uint8Array, d: number[]) => d.every((b, i) => data[i] === b)

/* ---------------- cap ---------------- */

/** Dev buy amount check. 0 = no dev buy. Anything above the cap (or not a number) throws. */
export function assertDevBuyAmount(sol: number): void {
  if (typeof sol !== 'number' || !Number.isFinite(sol) || sol < 0) throw new Error('Dev buy must be a number, zero or more.')
  if (sol > RULES.MAX_DEV_BUY_SOL + 1e-12) throw new Error(`Max dev buy is ${RULES.MAX_DEV_BUY_SOL} SOL. Lower it to launch.`)
}

/** SOL -> lamports for the dev buy, never above MAX_DEV_BUY_LAMPORTS. */
export function devBuyLamports(sol: number): number {
  assertDevBuyAmount(sol)
  const l = Math.floor(sol * LAMPORTS_PER_SOL + 1e-6)
  if (l > MAX_DEV_BUY_LAMPORTS) throw new Error(`Max dev buy is ${RULES.MAX_DEV_BUY_SOL} SOL.`)
  return l
}

export function assertLaunchParams(p: Pick<LaunchParams, 'name' | 'symbol' | 'devBuySol'>): void {
  if (!p.name.trim() || !p.symbol.trim()) throw new Error('Name and ticker are required.')
  assertDevBuyAmount(p.devBuySol)
}

/** First slot at which the dev buy may be sent. */
export const devBuyUnlockSlot = (creationSlot: number) => creationSlot + RULES.DEV_BUY_MIN_SLOTS_AFTER_CREATE

export function assertDevBuyAllowed(sol: number, creationSlot: number, currentSlot: number): void {
  if (devBuyLamports(sol) <= 0) throw new Error('Nothing to buy.')
  if (!(currentSlot >= devBuyUnlockSlot(creationSlot))) {
    throw new Error(`Dev buy unlocks after block 0 (slot ${devBuyUnlockSlot(creationSlot)}); chain is at ${currentSlot}.`)
  }
}

/* ---------------- message checks ---------------- */

function staticKeys(tx: VersionedTransaction) { return tx.message.staticAccountKeys.map((k) => k.toBase58()) }
function signerKeys(tx: VersionedTransaction) { return staticKeys(tx).slice(0, tx.message.header.numRequiredSignatures) }

/** The create tx: only ComputeBudget + one pump create_v2; signers exactly {creator, mint}. */
export function assertCleanCreate(tx: VersionedTransaction, creator: PublicKey, mint: PublicKey): void {
  if (tx.message.addressTableLookups.length) throw new Error('Create tx must not use lookup tables.')
  const keys = staticKeys(tx)
  const signers = signerKeys(tx).sort()
  const want = [creator.toBase58(), mint.toBase58()].sort()
  if (signers.length !== 2 || signers[0] !== want[0] || signers[1] !== want[1]) throw new Error('Create tx must be signed by the creator and the mint only.')
  if (keys[0] !== creator.toBase58()) throw new Error('Creator must pay for the create tx.')
  let creates = 0
  for (const ix of tx.message.compiledInstructions) {
    const prog = keys[ix.programIdIndex]
    if (prog === COMPUTE_BUDGET || prog === LIGHTHOUSE) continue
    if (prog === PUMP && hasDisc(ix.data, DISC.create_v2)) { creates++; continue }
    throw new Error(`Create tx contains a disallowed instruction (${prog}). No buys, no tips, no transfers.`)
  }
  if (creates !== 1) throw new Error('Create tx must contain exactly one pump.fun create.')
}

/** The dev buy tx: ComputeBudget, idempotent ATA creates and ONE buy_exact_quote_in_v3 capped at MAX_DEV_BUY_LAMPORTS. */
export function assertCleanDevBuy(tx: VersionedTransaction, creator: PublicKey): void {
  if (tx.message.addressTableLookups.length) throw new Error('Dev buy tx must not use lookup tables.')
  const keys = staticKeys(tx)
  const signers = signerKeys(tx)
  if (signers.length !== 1 || signers[0] !== creator.toBase58()) throw new Error('Dev buy must be signed by the creator only.')
  let buys = 0
  for (const ix of tx.message.compiledInstructions) {
    const prog = keys[ix.programIdIndex]
    if (prog === COMPUTE_BUDGET || prog === LIGHTHOUSE || prog === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) continue
    if (prog === PUMP && hasDisc(ix.data, DISC.buy_exact_quote_in_v3)) {
      // args: spendable_quote_in u64 @8, min_tokens_out u64 @16
      const quoteIn = readU64LE(ix.data, 8)
      if (quoteIn > BigInt(MAX_DEV_BUY_LAMPORTS)) throw new Error(`Dev buy over ${RULES.MAX_DEV_BUY_SOL} SOL.`)
      buys++
      continue
    }
    if (prog === SYSTEM) throw new Error('Dev buy tx must not transfer SOL directly.')
    throw new Error(`Dev buy tx contains a disallowed instruction (${prog}).`)
  }
  if (buys !== 1) throw new Error('Dev buy tx must contain exactly one buy.')
}

/* ---------------- builders ---------------- */

async function toTx(conn: Connection, payer: PublicKey, ixs: TransactionInstruction[]) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed')
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message())
  return { tx, blockhash, lastValidBlockHeight }
}

export interface BuiltTx { tx: VersionedTransaction; blockhash: string; lastValidBlockHeight: number }

/**
 * Create-only tx (no buy). Unsigned: the creator's wallet signs first, then the caller adds the
 * fresh mint keypair's signature (wallets such as Phantom ask for user-first signing).
 */
export async function buildCreateTx(conn: Connection, p: { creator: PublicKey; name: string; symbol: string; uri: string; priorityMicroLamports?: number; mint?: Keypair }): Promise<BuiltTx & { mint: Keypair }> {
  const mint = p.mint ?? Keypair.generate()
  const createIx = await PUMP_SDK.createV2Instruction({
    mint: mint.publicKey, name: p.name, symbol: p.symbol, uri: p.uri, creator: p.creator, user: p.creator, mayhemMode: false,
  })
  const built = await toTx(conn, p.creator, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: CREATE_COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: p.priorityMicroLamports ?? DEFAULT_PRIORITY_MICRO_LAMPORTS }),
    createIx,
  ])
  assertCleanCreate(built.tx, p.creator, mint.publicKey)
  return { ...built, mint }
}

/** The dev's capped buy, only after block 0. `currentSlot` is read from the RPC if not given. */
export async function buildDevBuyTx(conn: Connection, p: { creator: PublicKey; mint: PublicKey; sol: number; creationSlot: number; slippagePct: number; priorityMicroLamports?: number; currentSlot?: number }): Promise<BuiltTx> {
  const lamports = devBuyLamports(p.sol)
  const current = p.currentSlot ?? await conn.getSlot('confirmed')
  assertDevBuyAllowed(p.sol, p.creationSlot, current)
  const online = new OnlinePumpSdk(conn)
  const [global, feeConfig, state] = await Promise.all([
    online.fetchGlobal(), online.fetchFeeConfig(), online.fetchBuyState(p.mint, p.creator, TOKEN_2022_PROGRAM_ID),
  ])
  const quoteAmount = new BN(lamports)
  const amount = getBuyV3TokenAmountFromQuoteAmount({
    global, feeConfig, mintSupply: state.bondingCurve.tokenTotalSupply, bondingCurve: state.bondingCurve,
    amount: quoteAmount, curveBaseTokenBalance: state.curveBaseTokenBalance, quoteTransferFee: state.quoteTransferFee,
  })
  const buyIxs = await PUMP_SDK.buyExactQuoteInV3Instructions({
    bondingCurve: state.bondingCurve, associatedUserAccountInfo: state.associatedUserAccountInfo,
    mint: p.mint, user: p.creator, amount, quoteAmount, slippage: p.slippagePct,
    tokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: state.quoteTokenProgram,
  })
  const built = await toTx(conn, p.creator, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: BUY_COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: p.priorityMicroLamports ?? DEFAULT_PRIORITY_MICRO_LAMPORTS }),
    ...buyIxs,
  ])
  assertCleanDevBuy(built.tx, p.creator)
  return built
}
