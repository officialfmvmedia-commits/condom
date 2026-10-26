/**
 * Mainnet dry run of the CONDOM launch txs. Builds the real create (no buy) and dev-buy transactions with
 * the same code the browser uses, then simulateTransaction(sigVerify: false). NOTHING IS SENT.
 * usage: npm run simulate -- [payerPubkey] [existingCreateV2Mint]
 * The payer only needs SOL on mainnet for the simulation to get past fee/rent checks; no key is involved.
 */
import { Connection, PublicKey, type VersionedTransaction } from '@solana/web3.js'
import { ComputeBudgetProgram, TransactionMessage, VersionedTransaction as VTx } from '@solana/web3.js'
import BN from 'bn.js'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { OnlinePumpSdk, PUMP_SDK, newBondingCurve } from '@pump-fun/pump-sdk'
import { buildCreateTx, buildDevBuyTx, devBuyLamports } from '../src/lib/launchpad/launchTxBuilder'

const RPC = process.env.RPC || 'https://api.mainnet-beta.solana.com'
const PAYER = new PublicKey(process.argv[2] || '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9') // any funded system account
const conn = new Connection(RPC, { commitment: 'confirmed', fetch: (u, i) => globalThis.fetch(u as string, { method: i?.method, headers: i?.headers as HeadersInit, body: i?.body as BodyInit }).catch((e) => { console.error('fetch error', e?.cause ?? e); throw e }) as never })
const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'

async function sim(label: string, tx: VersionedTransaction) {
  const r = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true })
  const logs = r.value.logs ?? []
  console.log(`\n== ${label}: ${r.value.err ? 'FAIL ' + JSON.stringify(r.value.err) : 'OK'} · ${r.value.unitsConsumed} CU · ${tx.serialize().length} bytes`)
  console.log(logs.filter((l) => /Instruction:|failed|error|Error|consumed/.test(l)).slice(0, 14).map((l) => '  ' + l).join('\n'))
  return !r.value.err
}

/** A recent create_v2 coin still on its curve, for simulating the dev buy. */
async function recentCreateV2(): Promise<{ mint: PublicKey; slot: number }> {
  const sigs = await conn.getSignaturesForAddress(new PublicKey(PUMP), { limit: 200 })
  for (const s of sigs) {
    if (s.err) continue
    const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }] }) })
    const tx = (await res.json()).result as { slot: number; meta: { logMessages?: string[]; postTokenBalances?: { mint: string }[] } } | null
    if (!tx?.meta?.logMessages?.some((l) => l.includes('Instruction: CreateV2'))) continue
    const bal = tx.meta.postTokenBalances?.find((b) => b.mint.endsWith('pump')) ?? tx.meta.postTokenBalances?.[0]
    if (bal) return { mint: new PublicKey(bal.mint), slot: tx.slot }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('no recent create_v2 found')
}

const results: Record<string, boolean> = {}
const create = await buildCreateTx(conn, { creator: PAYER, name: 'Condom Sim', symbol: 'CSIM', uri: 'https://ipfs.io/ipfs/bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy' })
results.create = await sim(`create_v2 only (mint ${create.mint.publicKey.toBase58()})`, create.tx)

// Verification only (never shipped): our create_v2 + the same v3 buy in ONE tx, to prove the first-ever buy on a
// fresh CONDOM curve works. The real flow sends these as two txs, the buy only after block 0.
{
  const createIx = await PUMP_SDK.createV2Instruction({ mint: create.mint.publicKey, name: 'Condom Sim', symbol: 'CSIM', uri: 'https://ipfs.io/ipfs/x', creator: PAYER, user: PAYER, mayhemMode: false })
  const global = await new OnlinePumpSdk(conn).fetchGlobal()
  const curve = newBondingCurve(global)
  const buyIxs = await PUMP_SDK.buyExactQuoteInV3Instructions({ bondingCurve: curve, associatedUserAccountInfo: null, mint: create.mint.publicKey, user: PAYER, amount: new BN(1), quoteAmount: new BN(devBuyLamports(0.3)), slippage: 0, tokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID })
  const { blockhash } = await conn.getLatestBlockhash()
  const tx = new VTx(new TransactionMessage({ payerKey: PAYER, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), createIx, ...buyIxs] }).compileToV0Message())
  results.firstBuyOnFreshCurve = await sim('verification only: create_v2 + first v3 buy of 0.3 SOL on the fresh curve', tx)
}

const coin = process.argv[3] ? { mint: new PublicKey(process.argv[3]), slot: 0 } : await recentCreateV2()
console.log(`\nDev-buy target: ${coin.mint.toBase58()} (created slot ${coin.slot})`)
const buy = await buildDevBuyTx(conn, { creator: PAYER, mint: coin.mint, sol: 0.3, creationSlot: coin.slot, slippagePct: 5 })
if (process.env.DEBUG) { const m = buy.tx.message; const k = m.staticAccountKeys.map((x) => x.toBase58()); for (const ix of m.compiledInstructions) if (k[ix.programIdIndex] === PUMP) console.log(ix.accountKeyIndexes.map((i) => k[i])) }
results.devBuy03 = await sim('dev buy 0.3 SOL (buy_exact_quote_in_v3)', buy.tx)

const expectThrow = async (label: string, f: () => Promise<unknown> | unknown) => {
  try { await f(); console.log(`\n== ${label}: FAIL (did not throw)`); results[label] = false } catch (e) { console.log(`\n== ${label}: OK, rejected: ${(e as Error).message}`); results[label] = true }
}
await expectThrow('reject 0.31 SOL', () => buildDevBuyTx(conn, { creator: PAYER, mint: coin.mint, sol: 0.31, creationSlot: coin.slot, slippagePct: 5 }))
await expectThrow('reject buy in block 0', () => buildDevBuyTx(conn, { creator: PAYER, mint: coin.mint, sol: 0.1, creationSlot: 1000, slippagePct: 5, currentSlot: 1001 }))
console.log('\nmax dev buy lamports', devBuyLamports(0.3))
console.log('\nSUMMARY', results)
process.exit(Object.values(results).every(Boolean) ? 0 : 1)
