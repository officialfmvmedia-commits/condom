import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { createPool, migrate, type Db } from '../src/db'
import { parseExcluded, purgeExcluded } from '../src/excluded'
import { pollGenesis, type ListSigs } from '../src/genesis'
import { insertTrades } from '../src/trades'
import { fakeCreateTx, signedReserve, wallet } from './helpers'

const url = process.env.TEST_DATABASE_URL
const d = url ? describe : describe.skip

d('EXCLUDED_MINTS (Postgres)', () => {
  let db: Db
  let chain: Map<string, { signature: string; err: unknown; blockTime: number }[]>
  let txs: Map<string, any>
  let listCalls: { until?: string }[]
  const listSigs: ListSigs = async (addr, { until, limit }) => {
    listCalls.push({ until })
    const all = chain.get(addr) ?? []
    const stop = until ? all.findIndex((s) => s.signature === until) : -1
    return (stop >= 0 ? all.slice(0, stop) : all).slice(0, limit)
  }
  const push = (addr: string, sig: string, tx: any) => {
    chain.set(addr, [{ signature: sig, err: null, blockTime: Math.floor(Date.now() / 1000) }, ...(chain.get(addr) ?? [])])
    txs.set(sig, tx)
  }
  const poll = (creators: string[], excluded: Set<string>) => pollGenesis({
    db, creators, excluded, listSigs, fetchTx: async (s) => txs.get(s) ?? null, fetchMetadata: async () => null,
  })

  beforeAll(async () => { db = createPool(url!); await migrate(db) })
  afterAll(async () => db?.end())
  beforeEach(async () => {
    await db.query('truncate tickers, genesis_watch, trades, trade_cursor, excluded_mints')
    chain = new Map(); txs = new Map(); listCalls = []
  })

  it('parses the env list', () => {
    expect([...parseExcluded(' a, b ,,c ')]).toEqual(['a', 'b', 'c'])
    expect(parseExcluded(undefined).size).toBe(0)
  })

  it('removes the old genesis coin, frees its ticker, and the creator NEXT create becomes First born #1', async () => {
    const g = wallet(), oldMint = wallet(), newMint = wallet()
    // 1. old $CONDOM auto-registered as genesis, with trades
    push(g.pub, 'oldCreate', fakeCreateTx({ mint: oldMint.pub, creator: g.pub, symbol: 'CONDOM', name: 'CondomDotFun' }))
    expect((await poll([g.pub], new Set())).map((e) => e.result)).toEqual(['registered'])
    await insertTrades(db, [{ signature: 't1', ix: 0, mint: oldMint.pub, slot: 1, ts: new Date(), wallet: 'w', side: 'buy', solLamports: 1n, tokenAmount: 1n, priceSol: 1, mcapSol: 1 }])
    await db.query(`insert into trade_cursor (mint, last_signature) values ($1, 't1')`, [oldMint.pub])

    // 2. exclude it (what index.ts does on startup)
    const excluded = new Set([oldMint.pub])
    expect(await purgeExcluded(db, excluded)).toEqual({ tickers: 1, trades: 1 })
    expect((await db.query('select count(*)::int n from trade_cursor')).rows[0].n).toBe(0)
    expect((await db.query('select registered, last_signature from genesis_watch')).rows[0]).toEqual({ registered: 0, last_signature: 'oldCreate' })

    // 3. API: hidden + 404, ticker available again
    const app = createApp({ db, fetchTx: async (s) => txs.get(s) ?? null, excluded, rateLimitPerMinute: 10_000 })
    expect((await (await app.request('/coins')).json()).items).toEqual([])
    for (const p of ['', '/trades', '/candles', '/holders', '/stats']) expect((await app.request(`/coins/${oldMint.pub}${p}`)).status, p).toBe(404)
    expect(await (await app.request('/tickers/CONDOM')).json()).toMatchObject({ available: true })
    expect((await app.request('/tickers/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticker: 'CONDOM', mint: oldMint.pub, signature: 'oldCreate' }) })).status).toBe(422)

    // 4. watcher resumes from the saved signature, never re-adds the old mint
    listCalls = []
    expect(await poll([g.pub], excluded)).toEqual([])
    expect(listCalls[0].until).toBe('oldCreate')
    // even if the old create shows up again (rescan), it is excluded
    await db.query(`update genesis_watch set last_signature = null`)
    expect((await poll([g.pub], excluded)).map((e) => e.result)).toEqual(['excluded'])
    expect((await db.query('select count(*)::int n from tickers')).rows[0].n).toBe(0)

    // 5. relaunch: next create from the creator takes CONDOM as First born #1
    push(g.pub, 'newCreate', fakeCreateTx({ mint: newMint.pub, creator: g.pub, symbol: 'CONDOM', name: 'CONDOM' }))
    expect((await poll([g.pub], excluded)).map((e) => [e.mint, e.result])).toEqual([[newMint.pub, 'registered']])
    const { rows } = await db.query('select mint, genesis, born_order, ticker_norm from tickers')
    expect(rows).toEqual([{ mint: newMint.pub, genesis: true, born_order: 1, ticker_norm: 'CONDOM' }])
    const coins = (await (await app.request('/coins')).json()).items
    expect(coins.map((c: any) => [c.mint, c.genesis])).toEqual([[newMint.pub, true]])

    // 6. a later create is NOT auto-registered (limit 1 counts only non-excluded coins)
    const third = wallet()
    push(g.pub, 'third', fakeCreateTx({ mint: third.pub, creator: g.pub, symbol: 'THREE' }))
    expect(await poll([g.pub], excluded)).toEqual([])
    expect((await db.query('select count(*)::int n from tickers')).rows[0].n).toBe(1)
  })

  it('a relaunch through the normal reserve flow can take the freed ticker', async () => {
    const g = wallet(), oldMint = wallet()
    await db.query(`insert into tickers (ticker_norm, ticker_display, creator, status, mint, live_at, genesis, born_order)
      values ('CONDOM','CONDOM',$1,'live',$2,now(),true,1)`, [g.pub, oldMint.pub])
    const excluded = new Set([oldMint.pub])
    await purgeExcluded(db, excluded)
    const app = createApp({ db, fetchTx: async () => null, excluded, rateLimitPerMinute: 10_000 })
    const r = await app.request('/tickers/reserve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticker: 'CONDOM', ...signedReserve(g, 'CONDOM') }) })
    expect(r.status).toBe(200)
  })
})
