/**
 * CONDOM Launch Report analyzer.
 * Given a pump.fun mint, reads the chain (read-only RPC) and reports:
 *   - the create transaction, slot and creator (dev wallet)
 *   - every buy in the creation slot + next N slots (default 2), flagging block-0 buyers
 *   - the dev's buy as % of supply (and SOL), checked against the 0.3 SOL cap
 *   - other buyers inside the create transaction (bundled into the launch)
 *   - early buyers funded directly by the dev wallet (1-hop SOL trace = side wallets)
 *   - Jito-tipped buys in the launch slot
 * and grades it PROTECTED / CAUTION / UNPROTECTED.
 */
import { parseTradeEvents } from './pumpEvents'
import { Rpc, accountKeys, type RawTx, type SigInfo, type TokenBal } from './rpc'
import type { EarlyBuy, LaunchReport, ReportCheck, Grade } from '../../src/lib/launchpad/report'
import { RULES } from '../../src/lib/rules'
import { supplyPctForFirstBuy } from '../../src/lib/curve'

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
export const PUMP_AMM_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
const WSOL = 'So11111111111111111111111111111111111111112'
const LAMPORTS = 1e9
/** Jito tip accounts (public, from Jito's docs / getTipAccounts). */
export const JITO_TIP_ACCOUNTS = new Set([
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5', 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY', 'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh', 'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL', '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
])
/** Small tolerance over the cap for rounding. */
const DEV_CAP_TOLERANCE_SOL = 0.005
/** Supply share the cap buys on a fresh 1B curve (≈1.06%). Used as a second cap when SOL can't be read (non-SOL quote). */
const DEV_CAP_PCT = supplyPctForFirstBuy(RULES.MAX_DEV_BUY_SOL) + 0.01

export interface AnalyzeOptions {
  rpcUrl?: string
  windowSlots?: number
  /** Max getSignaturesForAddress pages (1000 sigs each) to walk back to the create tx. */
  maxSignaturePages?: number
  /** How many of the dev wallet's signatures to index for the funding trace. */
  devHistoryLimit?: number
  /** How many of each early buyer's signatures before their buy to check for dev funding. */
  buyerHistoryLimit?: number
  log?: (msg: string) => void
}

export async function analyzeMint(mint: string, opts: AnalyzeOptions = {}): Promise<LaunchReport> {
  const rpcUrl = opts.rpcUrl ?? process.env.SOLANA_RPC ?? 'https://api.mainnet-beta.solana.com'
  const log = opts.log ?? (() => {})
  const rpc = new Rpc({ url: rpcUrl, log })
  const windowSlots = opts.windowSlots ?? RULES.REPORT_WINDOW_SLOTS
  const notes: string[] = []

  /* 1. Walk the mint's signature history back to its first (create) transaction. */
  log(`walking signature history for ${mint}`)
  const all: SigInfo[] = []
  let before: string | undefined
  const maxPages = opts.maxSignaturePages ?? 40
  for (let page = 0; ; page++) {
    if (page >= maxPages) throw new Error(`History longer than ${maxPages * 1000} signatures; raise maxSignaturePages or use an indexed RPC.`)
    const batch = await rpc.call<SigInfo[]>('getSignaturesForAddress', [mint, { limit: 1000, before, commitment: 'confirmed' }])
    all.push(...batch)
    if (batch.length < 1000) break
    before = batch[batch.length - 1].signature
  }
  if (!all.length) throw new Error('No transactions found for this mint.')
  // Oldest first. Within a slot RPC returns newest-first, so reversing keeps chain order.
  const chrono = [...all].reverse()
  log(`${all.length} signatures; fetching earliest transactions`)

  /* 2. Find the create transaction: earliest successful tx that ran pump.fun Create/CreateV2. */
  let createTx: RawTx | null = null
  let createSig = ''
  for (const s of chrono.slice(0, 25)) {
    if (s.err) continue
    const tx = await getTx(rpc, s.signature)
    const logs = tx?.meta?.logMessages ?? []
    const isPump = accountKeys(tx!).includes(PUMP_PROGRAM)
    if (isPump && logs.some((l) => /^Program log: Instruction: Create(V2)?$/.test(l))) { createTx = tx; createSig = s.signature; break }
  }
  if (!createTx) throw new Error('Could not find a pump.fun create transaction for this mint.')
  const creationSlot = createTx.slot
  const creator = createTx.transaction.message.accountKeys[0]

  /* 3. Identify the bonding curve: the owner holding the most of the mint right after create. */
  const createPost = (createTx.meta?.postTokenBalances ?? []).filter((b) => b.mint === mint)
  const curveBal = [...createPost].sort((a, b) => Number(BigInt(b.uiTokenAmount.amount) - BigInt(a.uiTokenAmount.amount)))[0]
  const curve = curveBal?.owner
  if (!curve) throw new Error('Could not identify the bonding curve account.')
  const decimals = curveBal.uiTokenAmount.decimals

  const supplyRes = await rpc.call<{ value: { amount: string; decimals: number } }>('getTokenSupply', [mint, { commitment: 'confirmed' }])
  const totalSupply = Number(BigInt(supplyRes.value.amount)) / 10 ** supplyRes.value.decimals

  /* 4. Fetch every successful tx in [creationSlot, creationSlot + windowSlots]. */
  const toSlot = creationSlot + windowSlots
  const windowSigs = chrono.filter((s) => s.slot >= creationSlot && s.slot <= toSlot && !s.err)
  const failedInWindow = chrono.filter((s) => s.slot >= creationSlot && s.slot <= toSlot && s.err).length
  log(`${windowSigs.length} successful txs in slots ${creationSlot}..${toSlot}`)
  const txs: { sig: string; tx: RawTx }[] = []
  for (const s of windowSigs) {
    const tx = s.signature === createSig ? createTx : await getTx(rpc, s.signature)
    if (tx?.meta && !tx.meta.err) txs.push({ sig: s.signature, tx })
  }

  // Rent paid into the curve account when it was created (so it isn't counted as dev buy SOL).
  let curveRentLamports = 0
  {
    const keys = accountKeys(createTx)
    const ci = keys.indexOf(curve)
    if (ci >= 0 && createTx.meta!.preBalances[ci] === 0) {
      const info = await rpc.call<{ value: { data: [string, string]; space?: number } | null }>('getAccountInfo', [curve, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }])
      const space = info.value?.space
      if (space != null) curveRentLamports = await rpc.call<number>('getMinimumBalanceForRentExemption', [space])
    }
  }

  /* 5. Extract buys. Primary source: pump.fun TradeEvent logs (exact SOL + tokens + buyer).
        Fallback (no events, e.g. routed through another program): token-balance deltas, with SOL
        taken from the bonding curve's SOL/wSOL inflow. */
  const earlyBuys: EarlyBuy[] = []
  let usedFallback = false
  let migrations = 0
  let nonSolQuote = false
  for (const { sig, tx } of txs) {
    const keys = accountKeys(tx)
    const jitoTip = keys.some((k, i) => JITO_TIP_ACCOUNTS.has(k) && tx.meta!.postBalances[i] > tx.meta!.preBalances[i])
    const base = { signature: sig, slot: tx.slot, slotOffset: tx.slot - creationSlot, inCreateTx: sig === createSig, block0: tx.slot === creationSlot, fundedByDev: false, fundingSignatures: [] as string[], jitoTip }
    const logs = tx.meta!.logMessages ?? []
    // Graduation moves the curve's tokens into the AMM pool; that's not a buy.
    if (logs.some((l) => /^Program log: Instruction: Migrate(V\d)?$/.test(l))) { migrations++; continue }
    const events = parseTradeEvents(logs, mint).filter((e) => e.isBuy)
    if (events.some((e) => e.solLamports === 0n && e.tokenAmount > 0n)) nonSolQuote = true
    if (events.length) {
      for (const e of events) {
        const tokens = Number(e.tokenAmount) / 10 ** decimals
        earlyBuys.push({ ...base, venue: 'curve', buyer: e.user, sol: Number(e.solLamports) / LAMPORTS, tokens, pctOfSupply: (tokens / totalSupply) * 100, isDev: e.user === creator })
      }
      continue
    }
    const deltas = tokenDeltasByOwner(tx.meta!.preTokenBalances ?? [], tx.meta!.postTokenBalances ?? [], mint)
    const buyers = [...deltas.entries()].filter(([owner, d]) => owner !== curve && d > 0n)
    if (!buyers.length) continue
    usedFallback = true
    const ci = keys.indexOf(curve)
    let quoteLamports = ci >= 0 ? tx.meta!.postBalances[ci] - tx.meta!.preBalances[ci] : 0
    if (sig === createSig) quoteLamports -= curveRentLamports
    quoteLamports += Number(tokenDeltasByOwner(tx.meta!.preTokenBalances ?? [], tx.meta!.postTokenBalances ?? [], WSOL).get(curve) ?? 0n)
    const totalTokens = buyers.reduce((a, [, d]) => a + d, 0n)
    const venue = keys.includes(PUMP_AMM_PROGRAM) ? 'amm' as const : quoteLamports > 0 ? 'curve' as const : 'other' as const
    const wsolDeltas = tokenDeltasByOwner(tx.meta!.preTokenBalances ?? [], tx.meta!.postTokenBalances ?? [], WSOL)
    for (const [buyer, d] of buyers) {
      const tokens = Number(d) / 10 ** decimals
      let sol: number
      if (quoteLamports > 0) sol = (quoteLamports * Number(d)) / Number(totalTokens) / LAMPORTS
      else {
        // Not a curve buy: use what the buyer spent (SOL + wSOL out, includes fees), an upper bound.
        const bi = keys.indexOf(buyer)
        const lamOut = bi >= 0 ? tx.meta!.preBalances[bi] - tx.meta!.postBalances[bi] : 0
        sol = (lamOut - Number(wsolDeltas.get(buyer) ?? 0n)) / LAMPORTS
      }
      earlyBuys.push({ ...base, venue, buyer, sol: Math.max(0, sol), tokens, pctOfSupply: (tokens / totalSupply) * 100, isDev: buyer === creator })
    }
  }
  if (usedFallback) notes.push('Some buys had no pump.fun trade event (AMM or routed); they were read from token balance changes. For AMM/other buys, SOL is what the buyer spent including fees.')
  if (nonSolQuote) notes.push('Some curve buys reported 0 SOL (the curve likely uses a non-SOL quote token). Their size is judged by % of supply instead.')
  if (migrations) notes.push('The coin graduated inside the report window; the migration to the AMM pool is not counted as a buy.')

  /* 6. Side-wallet trace: did the dev wallet send SOL straight to an early buyer before they bought? */
  const outsiders = uniq(earlyBuys.filter((b) => !b.isDev).map((b) => b.buyer))
  if (outsiders.length) {
    log(`tracing funding for ${outsiders.length} early buyers`)
    // Dev history BEFORE the create tx (funding happens before launch), plus the window txs themselves.
    const devSigs = new Set<string>(txs.map((t) => t.sig))
    let devBefore: string | undefined = createSig
    const devLimit = opts.devHistoryLimit ?? 3000
    while (devSigs.size < devLimit) {
      const batch: SigInfo[] = await rpc.call<SigInfo[]>('getSignaturesForAddress', [creator, { limit: 1000, before: devBefore, commitment: 'confirmed' }])
      batch.forEach((s) => devSigs.add(s.signature))
      if (batch.length < 1000) break
      devBefore = batch[batch.length - 1].signature
    }
    if (devSigs.size >= devLimit) notes.push(`Dev wallet has more than ${devLimit} pre-launch transactions; funding trace used the ${devLimit} just before the create.`)
    for (const buyer of outsiders) {
      const firstBuy = earlyBuys.find((b) => b.buyer === buyer)!
      const hist = await rpc.call<SigInfo[]>('getSignaturesForAddress', [buyer, { limit: opts.buyerHistoryLimit ?? 100, before: firstBuy.signature, commitment: 'confirmed' }])
      const shared = hist.filter((h) => !h.err && devSigs.has(h.signature))
      const funding: string[] = []
      for (const h of shared) {
        const tx = await getTx(rpc, h.signature)
        if (!tx?.meta) continue
        const keys = accountKeys(tx)
        const di = keys.indexOf(creator), bi = keys.indexOf(buyer)
        if (di < 0 || bi < 0) continue
        const devOut = tx.meta.preBalances[di] - tx.meta.postBalances[di]
        const buyerIn = tx.meta.postBalances[bi] - tx.meta.preBalances[bi]
        if (devOut > 0 && buyerIn > 0) funding.push(h.signature)
      }
      if (funding.length) for (const b of earlyBuys) if (b.buyer === buyer) { b.fundedByDev = true; b.fundingSignatures = funding }
    }
  }

  /* 7. Summarize, check, grade. */
  const createJito = earlyBuys.some((b) => b.inCreateTx && b.jitoTip) || hasJitoTip(createTx)
  const graded = summarize(earlyBuys, totalSupply, createJito)

  notes.push('Funding trace is 1 hop (dev wallet → buyer). Multi-hop or exchange-routed funding is not detected.')
  notes.push('SOL per buy is the amount that went into the bonding curve, before pump.fun fees.')
  if (failedInWindow) notes.push(`${failedInWindow} failed transaction(s) touched the mint in the window (not counted).`)
  log(`done in ${rpc.calls} RPC calls`)

  return {
    version: 1,
    mint,
    generatedAt: new Date().toISOString(),
    network: 'mainnet-beta',
    program: PUMP_PROGRAM,
    totalSupply,
    creation: { signature: createSig, slot: creationSlot, blockTime: createTx.blockTime, creator, jitoTip: createJito },
    window: { fromSlot: creationSlot, toSlot, slotsAfterCreation: windowSlots },
    dev: { wallet: creator, ...graded.dev },
    earlyBuys: earlyBuys.map((b) => ({ ...b, sol: round(b.sol, 6), tokens: round(b.tokens, 2), pctOfSupply: round(b.pctOfSupply, 4) })),
    summary: graded.summary,
    checks: graded.checks,
    grade: graded.grade,
    notes,
  }
}

/**
 * Pure grading step: turns the early buys into dev stats, summary, checks and a grade.
 * Exported so saved reports can be regraded when the rules change (analyzer/src/regrade.ts).
 */
export function summarize(earlyBuys: EarlyBuy[], totalSupply: number, createJito: boolean) {
  const dev = earlyBuys.filter((b) => b.isDev)
  const devBuySol = sum(dev.map((b) => b.sol))
  const devBuyTokens = sum(dev.map((b) => b.tokens))
  const devB0 = dev.filter((b) => b.block0)
  const out = earlyBuys.filter((b) => !b.isDev)
  const b0 = out.filter((b) => b.block0)
  const funded = out.filter((b) => b.fundedByDev)
  const createBuys = earlyBuys.filter((b) => b.inCreateTx)
  const createExtra = uniq(createBuys.filter((b) => !b.isDev).map((b) => b.buyer))
  const jitoB0 = b0.filter((b) => b.jitoTip)
  const block0Pct = sum(b0.map((b) => b.pctOfSupply))
  const devPct = (devBuyTokens / totalSupply) * 100
  const firstDev = dev.length ? Math.min(...dev.map((b) => b.slotOffset)) : null

  const checks: ReportCheck[] = [
    {
      id: 'dev-block0', label: 'Dev in block 0',
      status: devB0.length ? 'fail' : 'pass',
      detail: devB0.length
        ? `Dev bought ${sum(devB0.map((b) => b.sol)).toFixed(3)} SOL in block 0${devB0.some((b) => b.inCreateTx) ? ' (inside the create tx)' : ''}`
        : firstDev != null ? `Dev's first buy came ${firstDev} slot(s) after creation` : 'Dev did not buy in the window',
    },
    {
      id: 'dev-cap', label: 'Dev buy size',
      status: devBuySol <= RULES.MAX_DEV_BUY_SOL + DEV_CAP_TOLERANCE_SOL && devPct <= DEV_CAP_PCT ? 'pass' : 'fail',
      detail: `${devBuySol.toFixed(3)} SOL · ${devPct.toFixed(2)}% of supply (cap ${RULES.MAX_DEV_BUY_SOL} SOL / ${DEV_CAP_PCT.toFixed(2)}%)`,
    },
    {
      id: 'create-bundle', label: 'Bundle check',
      status: createExtra.length ? 'fail' : 'pass',
      detail: createExtra.length ? `${createExtra.length} other wallet(s) bought inside the create tx`
        : createBuys.length ? 'No other wallet bought inside the create tx' : 'No buys inside the create tx',
    },
    {
      id: 'dev-funded', label: 'Dev-funded wallets',
      status: funded.length ? 'fail' : 'pass',
      detail: funded.length ? `${uniq(funded.map((b) => b.buyer)).length} early buyer(s) funded by the dev · ${sum(funded.map((b) => b.pctOfSupply)).toFixed(2)}%` : 'No early buyer was funded directly by the dev',
    },
    {
      id: 'block0', label: 'Outside block-0 buys',
      status: block0Pct >= RULES.BLOCK0_CAUTION_PCT ? 'warn' : 'pass',
      detail: b0.length ? `${uniq(b0.map((b) => b.buyer)).length} wallet(s) · ${block0Pct.toFixed(2)}% · named` : 'No outsider bought in block 0',
    },
    {
      id: 'jito-bundle', label: 'Launch-slot tips',
      status: createJito && jitoB0.length ? 'warn' : 'pass',
      detail: createJito && jitoB0.length ? `Create tx and ${jitoB0.length} block-0 buy(s) paid Jito tips` : 'No tip-bundled buys alongside the create',
    },
  ]
  const grade: Grade = checks.some((c) => c.status === 'fail') ? 'UNPROTECTED' : checks.some((c) => c.status === 'warn') ? 'CAUTION' : 'PROTECTED'
  return {
    dev: { buySol: round(devBuySol, 6), buyTokens: round(devBuyTokens, 2), buyPctOfSupply: round(devPct, 4), block0Buy: devB0.length > 0, firstBuySlotOffset: firstDev },
    summary: {
      block0Buyers: uniq(b0.map((b) => b.buyer)).length,
      block0OutsiderPctOfSupply: round(block0Pct, 4),
      earlyBuyers: uniq(out.map((b) => b.buyer)).length,
      earlyOutsiderPctOfSupply: round(sum(out.map((b) => b.pctOfSupply)), 4),
      devFundedWallets: uniq(funded.map((b) => b.buyer)).length,
      devFundedPctOfSupply: round(sum(funded.map((b) => b.pctOfSupply)), 4),
      createTxExtraBuyers: createExtra.length,
    },
    checks,
    grade,
  }
}

async function getTx(rpc: Rpc, sig: string): Promise<RawTx | null> {
  return rpc.call<RawTx | null>('getTransaction', [sig, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }])
}

function tokenDeltasByOwner(pre: TokenBal[], post: TokenBal[], mint: string): Map<string, bigint> {
  const m = new Map<string, bigint>()
  for (const b of pre) if (b.mint === mint && b.owner) m.set(b.owner, (m.get(b.owner) ?? 0n) - BigInt(b.uiTokenAmount.amount))
  for (const b of post) if (b.mint === mint && b.owner) m.set(b.owner, (m.get(b.owner) ?? 0n) + BigInt(b.uiTokenAmount.amount))
  return m
}

function hasJitoTip(tx: RawTx): boolean {
  const keys = accountKeys(tx)
  return keys.some((k, i) => JITO_TIP_ACCOUNTS.has(k) && tx.meta!.postBalances[i] > tx.meta!.preBalances[i])
}

const uniq = <T,>(a: T[]) => [...new Set(a)]
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d
