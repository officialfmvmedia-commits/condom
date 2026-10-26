import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bs58 from 'bs58'
import { bondingCurvePda, curveMetrics, decodeCurve, heliusKey, INITIAL_PRICE_SOL } from '../src/market'
import { candles, decodeTradeEvent, insertTrades, parseEnhancedTrades, recentTrades, tradeStats, type TradeRow } from '../src/trades'
import { createApp } from '../src/app'
import { createPool, migrate, type Db } from '../src/db'
import { wallet } from './helpers'

const MINT = 'FxYVdzP68ctvgAsEBGw66ikLd78LfAVFkFy7ffEYpump'

function curveBytes(v: { vTok: bigint; vSol: bigint; rTok: bigint; rSol: bigint; supply: bigint; complete: boolean; creator: string }) {
  const b = Buffer.alloc(166)
  b.writeBigUInt64LE(v.vTok, 8); b.writeBigUInt64LE(v.vSol, 16); b.writeBigUInt64LE(v.rTok, 24); b.writeBigUInt64LE(v.rSol, 32)
  b.writeBigUInt64LE(v.supply, 40); b[48] = v.complete ? 1 : 0; Buffer.from(bs58.decode(v.creator)).copy(b, 49)
  return b
}

function tradeEventData(o: { mint: string; sol: bigint; tokens: bigint; isBuy: boolean; user: string; ts: number; vSol: bigint; vTok: bigint }) {
  const b = Buffer.alloc(16 + 32 + 8 + 8 + 1 + 32 + 8 + 32 + 64)
  Buffer.from([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d, 189, 219, 127, 211, 78, 230, 97, 238]).copy(b, 0)
  let o2 = 16
  Buffer.from(bs58.decode(o.mint)).copy(b, o2); o2 += 32
  b.writeBigUInt64LE(o.sol, o2); o2 += 8
  b.writeBigUInt64LE(o.tokens, o2); o2 += 8
  b[o2] = o.isBuy ? 1 : 0; o2 += 1
  Buffer.from(bs58.decode(o.user)).copy(b, o2); o2 += 32
  b.writeBigInt64LE(BigInt(o.ts), o2); o2 += 8
  b.writeBigUInt64LE(o.vSol, o2); o2 += 8
  b.writeBigUInt64LE(o.vTok, o2)
  return b
}

describe('bonding curve math', () => {
  it('matches the real $CONDOM curve snapshot', () => {
    // read from mainnet 2026-10-26 (bonding curve ErEG6v2mwoEmxShFeokPi8e3hDkFk6C6JVTQK3nfFN2V)
    expect(bondingCurvePda(MINT)).toBe('ErEG6v2mwoEmxShFeokPi8e3hDkFk6C6JVTQK3nfFN2V')
    const c = decodeCurve(curveBytes({ vTok: 1040009296881618n, vSol: 30951646479n, rTok: 760109296881618n, rSol: 951646479n, supply: 1000000000000000n, complete: false, creator: '4nPHm2VvuUqdot31hvCKPXPUmF5GwJYdJd5tvgoqrJzr' }))
    expect(c.creator).toBe('4nPHm2VvuUqdot31hvCKPXPUmF5GwJYdJd5tvgoqrJzr')
    const m = curveMetrics(c)
    expect(m.priceSol).toBeCloseTo(2.9761e-8, 11)
    expect(m.marketCapSol).toBeCloseTo(29.76, 2)
    expect(m.curveProgress).toBeCloseTo(0.0416, 3)
    expect(m.solInCurve).toBeCloseTo(0.9516, 4)
    expect(m.graduated).toBe(false)
    expect(INITIAL_PRICE_SOL * 1e9).toBeCloseTo(27.96, 2) // fresh coin mcap ≈ 28 SOL
  })
  it('graduated curve = 100%', () => {
    const m = curveMetrics(decodeCurve(curveBytes({ vTok: 1n, vSol: 1n, rTok: 0n, rSol: 0n, supply: 10n ** 15n, complete: true, creator: MINT })))
    expect(m.graduated).toBe(true)
    expect(m.curveProgress).toBe(1)
  })
  it('derives the Helius key only from a Helius RPC_URL', () => {
    expect(heliusKey('https://mainnet.helius-rpc.com/?api-key=abc')).toBe('abc')
    expect(heliusKey('https://api.mainnet-beta.solana.com')).toBeNull()
  })
})

describe('TradeEvent decoding', () => {
  const user = wallet().pub
  it('decodes emit_cpi data and parses Helius enhanced txs (CPI via router)', () => {
    const data = tradeEventData({ mint: MINT, sol: 917997191n, tokens: 29957210128454n, isBuy: true, user, ts: 1793017994, vSol: 31_552_475_449n, vTok: 1_000_000_000_000_000n })
    const e = decodeTradeEvent(data)!
    expect(e).toMatchObject({ mint: MINT, sol: 917997191n, isBuy: true, user, timestamp: 1793017994 })
    const rows = parseEnhancedTrades({
      signature: 'sig', slot: 5, timestamp: 1793017994, transactionError: null,
      instructions: [{ programId: 'Router111', data: '1', innerInstructions: [
        { programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', data: bs58.encode(Buffer.from([1, 2, 3])) },
        { programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', data: bs58.encode(data) },
      ] }],
    }, MINT)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ side: 'buy', wallet: user, slot: 5 })
    expect(rows[0].mcapSol).toBeCloseTo(31.55, 2)
    expect(parseEnhancedTrades({ signature: 's', slot: 1, timestamp: 1, transactionError: { x: 1 }, instructions: [] }, MINT)).toEqual([])
  })
  it('ignores other mints and non-trade data', () => {
    const other = tradeEventData({ mint: wallet().pub, sol: 1n, tokens: 1n, isBuy: false, user, ts: 1, vSol: 1n, vTok: 1n })
    expect(parseEnhancedTrades({ signature: 's', slot: 1, timestamp: 1, transactionError: null, instructions: [{ programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', data: bs58.encode(other) }] }, MINT)).toEqual([])
    expect(decodeTradeEvent(new Uint8Array(40))).toBeNull()
  })
})

const url = process.env.TEST_DATABASE_URL
const d = url ? describe : describe.skip
d('trades, candles, stats (Postgres)', () => {
  let db: Db
  beforeAll(async () => { db = createPool(url!); await migrate(db) })
  afterAll(async () => db?.end())
  beforeEach(async () => { await db.query('truncate trades; truncate tickers') })

  const row = (i: number, side: 'buy' | 'sell', sol: number, mcap: number, ageSec: number): TradeRow => ({
    signature: `s${i}`, ix: 0, mint: MINT, slot: 1000 + i, ts: new Date(Date.now() - ageSec * 1000), wallet: 'w' + i, side,
    solLamports: BigInt(Math.round(sol * 1e9)), tokenAmount: 1_000_000n, priceSol: mcap / 1e9, mcapSol: mcap,
  })

  it('inserts idempotently and builds OHLC + 24h stats', async () => {
    const now = Math.floor(Date.now() / 1000)
    const ago = (bucketsBack: number, sec: number) => now - (now % 60) - bucketsBack * 60 + sec
    const rows = [
      row(1, 'buy', 1, 30, now - ago(2, 5)), row(2, 'buy', 2, 40, now - ago(2, 20)), row(3, 'sell', 0.5, 35, now - ago(2, 40)),
      row(4, 'buy', 1, 50, now - ago(1, 10)), row(5, 'sell', 1, 45, now - ago(1, 30)),
      row(6, 'buy', 3, 20, 2 * 86400), // older than 24h
    ]
    expect(await insertTrades(db, rows)).toBe(6)
    expect(await insertTrades(db, rows)).toBe(0)
    const c = await candles(db, MINT, '1m')
    const last2 = c.slice(-2)
    expect(last2[0]).toMatchObject({ open: 30, high: 40, low: 30, close: 35, trades: 3 })
    expect(last2[0].volume).toBeCloseTo(3.5)
    expect(last2[1]).toMatchObject({ open: 35, high: 50, low: 35, close: 45, trades: 2 }) // open = prev close
    const s = await tradeStats(db, MINT)
    expect(s.txns24h).toBe(5)
    expect(s.buys24h).toBe(3)
    expect(s.volume24h).toBeCloseTo(5.5)
    expect(s.ath_mcap).toBe(50)
    expect(s.price_24h_ago).toBeCloseTo(20 / 1e9)
    const t = await recentTrades(db, MINT, 2)
    expect(t.map((x) => x.signature)).toEqual(['s5', 's4'])
  })

  it('market endpoints only serve registered CONDOM coins', async () => {
    const app = createApp({ db, fetchTx: async () => null })
    expect((await app.request(`/coins/${MINT}/trades`)).status).toBe(404)
    await db.query(`insert into tickers (ticker_norm, ticker_display, creator, status, mint, live_at) values ('CONDOM','CONDOM','x','live',$1,now())`, [MINT])
    await insertTrades(db, [row(9, 'buy', 1, 30, 10)])
    const r = await app.request(`/coins/${MINT}/trades`)
    expect((await r.json()).items).toHaveLength(1)
    expect((await app.request(`/coins/${MINT}/candles?tf=7m`)).status).toBe(400)
    expect((await app.request(`/coins/${MINT}/candles?tf=1m&unit=sol`)).status).toBe(200)
    expect((await app.request(`/coins/${MINT}/stats`)).status).toBe(503) // no live deps in this app
  })
})
