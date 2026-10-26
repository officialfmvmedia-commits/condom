import bs58 from 'bs58'
import type { Db } from './db'
import { bondingCurvePda, heliusKey, spotPriceSol, TOKEN_DECIMALS, SOL_DECIMALS, type RpcBatch, type RpcCall } from './market'
import { PUMP_PROGRAM_ID, type RpcTx } from './verify'

/**
 * pump.fun trade indexer. Every buy/sell emits TradeEvent via Anchor emit_cpi: an inner
 * instruction to the pump program whose data is
 *   e445a52e51cb9a1d (event tag) | bddb7fd34ee661ee (TradeEvent) | mint 32 | sol_amount u64 |
 *   token_amount u64 | is_buy bool | user 32 | timestamp i64 | virtual_sol u64 | virtual_token u64 |
 *   real_sol u64 | real_token u64 | ...
 */
const EVENT_IX_TAG = [0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d]
const TRADE_EVENT = [189, 219, 127, 211, 78, 230, 97, 238]

export interface TradeRow {
  signature: string
  ix: number
  mint: string
  slot: number
  ts: Date
  wallet: string
  side: 'buy' | 'sell'
  solLamports: bigint
  tokenAmount: bigint
  priceSol: number
  mcapSol: number
}

export function decodeTradeEvent(d: Uint8Array) {
  // accepts data with or without the 8-byte emit_cpi tag
  let o = 0
  if (EVENT_IX_TAG.every((b, i) => d[i] === b)) o = 8
  if (!TRADE_EVENT.every((b, i) => d[o + i] === b)) return null
  o += 8
  if (d.length < o + 32 + 8 + 8 + 1 + 32 + 8 + 8 * 4) return null
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const u64 = (at: number) => v.getBigUint64(at, true)
  const mint = bs58.encode(d.subarray(o, o + 32))
  const sol = u64(o + 32)
  const tokens = u64(o + 40)
  const isBuy = d[o + 48] === 1
  const user = bs58.encode(d.subarray(o + 49, o + 81))
  const timestamp = Number(v.getBigInt64(o + 81, true))
  const vSol = u64(o + 89)
  const vTok = u64(o + 97)
  return { mint, sol, tokens, isBuy, user, timestamp, vSol, vTok }
}

/** All TradeEvents for `mint` in a transaction (inner instructions, then "Program data:" logs). */
export function parseTrades(tx: RpcTx & { meta: any }, signature: string, mint: string, supplyTokens = 1_000_000_000): TradeRow[] {
  if (!tx?.meta || tx.meta.err) return []
  const msg = tx.transaction.message
  const keys = [...msg.accountKeys, ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])]
  const datas: Uint8Array[] = []
  for (const g of tx.meta.innerInstructions ?? []) {
    for (const ix of g.instructions) if (keys[ix.programIdIndex] === PUMP_PROGRAM_ID) datas.push(bs58.decode(ix.data))
  }
  if (!datas.length) {
    for (const l of (tx.meta.logMessages ?? []) as string[]) {
      if (l.startsWith('Program data: ')) datas.push(new Uint8Array(Buffer.from(l.slice(14), 'base64')))
    }
  }
  const out: TradeRow[] = []
  let n = 0
  for (const d of datas) {
    const e = decodeTradeEvent(d)
    if (!e || e.mint !== mint) continue
    const price = spotPriceSol(e.vSol, e.vTok)
    out.push({
      signature, ix: n++, mint, slot: tx.slot,
      ts: new Date((e.timestamp || (tx as any).blockTime || 0) * 1000),
      wallet: e.user, side: e.isBuy ? 'buy' : 'sell',
      solLamports: e.sol, tokenAmount: e.tokens, priceSol: price, mcapSol: price * supplyTokens,
    })
  }
  return out
}

/** Helius Enhanced Transactions API shape (subset). */
export interface EnhancedTx {
  signature: string
  slot: number
  timestamp: number
  transactionError: unknown
  instructions: { programId: string; data: string; innerInstructions?: { programId: string; data: string }[] }[]
}

export function parseEnhancedTrades(tx: EnhancedTx, mint: string, supplyTokens = 1_000_000_000): TradeRow[] {
  if (!tx || tx.transactionError) return []
  const out: TradeRow[] = []
  let n = 0
  for (const ix of tx.instructions ?? []) {
    for (const inner of [ix, ...(ix.innerInstructions ?? [])]) {
      if (inner.programId !== PUMP_PROGRAM_ID || !inner.data) continue
      let d: Uint8Array
      try { d = bs58.decode(inner.data) } catch { continue }
      const e = decodeTradeEvent(d)
      if (!e || e.mint !== mint) continue
      const price = spotPriceSol(e.vSol, e.vTok)
      out.push({
        signature: tx.signature, ix: n++, mint, slot: tx.slot, ts: new Date((e.timestamp || tx.timestamp) * 1000),
        wallet: e.user, side: e.isBuy ? 'buy' : 'sell', solLamports: e.sol, tokenAmount: e.tokens,
        priceSol: price, mcapSol: price * supplyTokens,
      })
    }
  }
  return out
}

export const TRADES_SQL = `
create table if not exists trades (
  signature     text not null,
  ix            integer not null,
  mint          text not null,
  slot          bigint not null,
  ts            timestamptz not null,
  wallet        text not null,
  side          text not null check (side in ('buy', 'sell')),
  sol_lamports  bigint not null,
  token_amount  numeric(30, 0) not null,
  price_sol     double precision not null,
  mcap_sol      double precision not null,
  primary key (signature, ix)
);
create index if not exists trades_mint_ts on trades (mint, ts desc, slot desc);
create table if not exists trade_cursor (
  mint           text primary key,
  last_signature text,
  backfilled     boolean not null default false,
  updated_at     timestamptz not null default now()
);
`

export async function insertTrades(db: Db, rows: TradeRow[]): Promise<number> {
  if (!rows.length) return 0
  const vals: unknown[] = []
  const ph = rows.map((r, i) => {
    vals.push(r.signature, r.ix, r.mint, r.slot, r.ts, r.wallet, r.side, r.solLamports.toString(), r.tokenAmount.toString(), r.priceSol, r.mcapSol)
    const b = i * 11
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`
  })
  const r = await db.query(
    `insert into trades (signature, ix, mint, slot, ts, wallet, side, sol_lamports, token_amount, price_sol, mcap_sol)
     values ${ph.join(',')} on conflict do nothing`,
    vals,
  )
  return r.rowCount ?? 0
}

// ----------------------------------------------------------------- indexer

export interface IndexDeps {
  db: Db
  call: RpcCall
  batch: RpcBatch
  /** RPC_URL; when it is Helius, the Enhanced Transactions API (100 txs/request) is used. */
  rpcUrl?: string
  fetchImpl?: typeof fetch
  log?: (m: string) => void
}

async function setCursor(db: Db, mint: string, sig: string) {
  await db.query(
    `insert into trade_cursor (mint, last_signature, updated_at) values ($1, $2, now())
     on conflict (mint) do update set last_signature = excluded.last_signature, updated_at = now()`,
    [mint, sig],
  )
}

/** Helius path: newest-first pages of 100 parsed txs back to the cursor (or creation). */
async function indexMintHelius(d: IndexDeps, mint: string, key: string, until?: string): Promise<number> {
  const curve = bondingCurvePda(mint)
  const f = d.fetchImpl ?? fetch
  const txs: EnhancedTx[] = []
  let before: string | undefined
  for (let p = 0; p < 300; p++) {
    const q = new URLSearchParams({ 'api-key': key, limit: '100' })
    if (before) q.set('before', before)
    if (until) q.set('until', until)
    let res: Response | null = null
    for (let a = 0; a < 4; a++) {
      res = await f(`https://api.helius.xyz/v0/addresses/${curve}/transactions?${q}`, { signal: AbortSignal.timeout(20_000) })
      if (res.status !== 429) break
      await new Promise((r) => setTimeout(r, 800 * (a + 1)))
    }
    if (!res || !res.ok) throw new Error(`Helius transactions HTTP ${res?.status}`)
    const page = (await res.json()) as EnhancedTx[]
    if (!Array.isArray(page) || !page.length) break
    txs.push(...page)
    if (page.length < 100) break
    before = page[page.length - 1].signature
  }
  if (!txs.length) return 0
  txs.reverse()
  let added = 0
  for (let i = 0; i < txs.length; i += 200) {
    const chunk = txs.slice(i, i + 200)
    added += await insertTrades(d.db, chunk.flatMap((t) => parseEnhancedTrades(t, mint)))
    await setCursor(d.db, mint, chunk[chunk.length - 1].signature)
  }
  return added
}

const BATCH = 5
const ENHANCED_THRESHOLD = 60
const MAX_PAGES = 30 // 30k signatures backfill cap per coin

/** Index new trades for one mint. Returns number of new trade rows. */
export async function indexMint(d: IndexDeps, mint: string): Promise<number> {
  const curve = bondingCurvePda(mint)
  const { rows } = await d.db.query('select last_signature from trade_cursor where mint = $1', [mint])
  const until: string | undefined = rows[0]?.last_signature ?? undefined
  // newest first, page back to `until` (or creation on first run)
  const sigs: { signature: string; err: unknown }[] = []
  let before: string | undefined
  for (let p = 0; p < MAX_PAGES; p++) {
    const page = await d.call<{ signature: string; err: unknown }[]>('getSignaturesForAddress', [curve, { limit: 1000, before, until, commitment: 'confirmed' }])
    sigs.push(...page)
    if (page.length < 1000) break
    before = page[page.length - 1].signature
  }
  sigs.reverse()
  // Credits: getSignaturesForAddress/getTransaction cost ~1 each; Helius Enhanced Transactions
  // cost ~100 per call (100 txs). Use enhanced only for big catch-ups (backfill / bursts).
  const key = d.rpcUrl ? heliusKey(d.rpcUrl) : null
  if (key && sigs.filter((s) => !s.err).length >= ENHANCED_THRESHOLD) {
    const n = await indexMintHelius(d, mint, key, until)
    if (n) d.log?.(`trades: ${mint.slice(0, 6)}… +${n} (backfill)`)
    return n
  }
  let added = 0
  for (let i = 0; i < sigs.length; i += BATCH) {
    const chunk = sigs.slice(i, i + BATCH)
    const ok = chunk.filter((s) => !s.err)
    const txs = await d.batch<any>(ok.map((s) => ({
      method: 'getTransaction',
      params: [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }],
    })))
    const rowsOut: TradeRow[] = []
    let missing = -1
    ok.forEach((s, j) => {
      if (!txs[j]) { if (missing < 0) missing = chunk.indexOf(s); return }
      rowsOut.push(...parseTrades(txs[j], s.signature, mint))
    })
    added += await insertTrades(d.db, rowsOut)
    await new Promise((r) => setTimeout(r, 600)) // stay under free-tier RPC rate limits (~10 req/s)
    // advance the cursor only past fully processed signatures
    const lastIdx = missing >= 0 ? missing - 1 : chunk.length - 1
    if (lastIdx >= 0) await setCursor(d.db, mint, chunk[lastIdx].signature)
    if (missing >= 0) break // retry the rest next poll
  }
  if (added) d.log?.(`trades: ${mint.slice(0, 6)}… +${added}`)
  return added
}

/** Polls live, non-graduated coins every `intervalMs` (graduated ones every 12th tick). */
export function startTradeIndexer(d: IndexDeps & { isGraduated: (mint: string) => Promise<boolean> }, intervalMs = 5000): () => void {
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  let tick = 0
  const run = async () => {
    const client = await d.db.connect().catch(() => null)
    try {
      if (client && (await client.query('select pg_try_advisory_lock(727002) as ok')).rows[0].ok) {
        try {
          const { rows } = await d.db.query(`select mint from tickers where status = 'live' and mint is not null order by genesis desc, live_at desc limit 200`)
          for (const { mint } of rows) {
            try {
              if (tick % 12 !== 0 && (await d.isGraduated(mint))) continue
              await indexMint(d, mint)
            } catch (e) {
              console.error(`trade index ${mint.slice(0, 6)}… failed: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
            }
          }
        } finally {
          await client.query('select pg_advisory_unlock(727002)')
        }
      }
    } catch (e) {
      console.error('trade indexer failed:', e instanceof Error ? e.message.slice(0, 200) : e)
    } finally {
      client?.release()
      tick++
      if (!stopped) timer = setTimeout(run, intervalMs)
    }
  }
  timer = setTimeout(run, 1500)
  return () => { stopped = true; clearTimeout(timer) }
}

// ----------------------------------------------------------------- queries

export interface TradeJson { signature: string; side: 'buy' | 'sell'; trader: string; sol: number; tokens: number; priceSol: number; marketCapSol: number; timestamp: number; slot: number; mint: string }

export async function recentTrades(db: Db, mint: string, limit = 50): Promise<TradeJson[]> {
  const { rows } = await db.query(
    `select * from trades where mint = $1 order by ts desc, slot desc, signature desc, ix desc limit $2`, [mint, limit])
  return rows.map((r) => ({
    signature: r.signature, side: r.side, trader: r.wallet, mint: r.mint,
    sol: Number(r.sol_lamports) / 10 ** SOL_DECIMALS, tokens: Number(r.token_amount) / 10 ** TOKEN_DECIMALS,
    priceSol: r.price_sol, marketCapSol: r.mcap_sol, timestamp: new Date(r.ts).getTime(), slot: Number(r.slot),
  }))
}

export const CANDLE_SECONDS: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }

/** OHLC of market cap (SOL) per bucket; open = previous bucket close for continuity. */
export async function candles(db: Db, mint: string, tf: string, limit = 500) {
  const sec = CANDLE_SECONDS[tf]
  if (!sec) throw new Error('bad timeframe')
  const { rows } = await db.query(
    `with t as (
       select floor(extract(epoch from ts) / $2)::bigint * $2 as bucket, ts, slot, signature, ix, mcap_sol, sol_lamports
       from trades where mint = $1 and ts > now() - make_interval(secs => $2 * $3::int)
     )
     select bucket,
       (array_agg(mcap_sol order by ts, slot, signature, ix))[1] as open,
       max(mcap_sol) as high, min(mcap_sol) as low,
       (array_agg(mcap_sol order by ts desc, slot desc, signature desc, ix desc))[1] as close,
       sum(sol_lamports)::float8 / 1e9 as volume, count(*)::int as trades
     from t group by bucket order by bucket`,
    [mint, sec, limit],
  )
  let prevClose: number | null = null
  return rows.map((r) => {
    const open = prevClose ?? r.open
    const c = { time: Number(r.bucket), open, high: Math.max(r.high, open), low: Math.min(r.low, open), close: r.close, volume: r.volume, trades: r.trades }
    prevClose = r.close
    return c
  })
}

export async function tradeStats(db: Db, mint: string) {
  const { rows } = await db.query(
    `select
       coalesce(sum(sol_lamports) filter (where ts > now() - interval '24 hours'), 0)::float8 / 1e9 as volume24h,
       count(*) filter (where ts > now() - interval '24 hours')::int as txns24h,
       count(*) filter (where ts > now() - interval '24 hours' and side = 'buy')::int as buys24h,
       count(*) filter (where ts > now() - interval '24 hours' and side = 'sell')::int as sells24h,
       count(*)::int as txns,
       coalesce(sum(sol_lamports), 0)::float8 / 1e9 as volume_all,
       max(mcap_sol) as ath_mcap,
       (select price_sol from trades where mint = $1 and ts <= now() - interval '24 hours' order by ts desc, slot desc limit 1) as price_24h_ago,
       min(ts) as first_trade
     from trades where mint = $1`,
    [mint],
  )
  return rows[0] as {
    volume24h: number; txns24h: number; buys24h: number; sells24h: number; txns: number; volume_all: number
    ath_mcap: number | null; price_24h_ago: number | null; first_trade: Date | null
  }
}

export async function bulkTradeStats(db: Db, mints: string[]) {
  if (!mints.length) return new Map<string, { volume24h: number; price24hAgo: number | null; ath: number | null }>()
  const { rows } = await db.query(
    `select m.mint,
       coalesce((select sum(sol_lamports) from trades t where t.mint = m.mint and t.ts > now() - interval '24 hours'), 0)::float8 / 1e9 as volume24h,
       (select price_sol from trades t where t.mint = m.mint and t.ts <= now() - interval '24 hours' order by ts desc limit 1) as price24h,
       (select max(mcap_sol) from trades t where t.mint = m.mint) as ath
     from unnest($1::text[]) as m(mint)`,
    [mints],
  )
  return new Map(rows.map((r) => [r.mint as string, { volume24h: r.volume24h as number, price24hAgo: r.price24h as number | null, ath: r.ath as number | null }]))
}
