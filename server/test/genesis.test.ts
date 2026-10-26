import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { createPool, migrate, type Db } from '../src/db'
import { pollGenesis, type ListSigs } from '../src/genesis'
import { fakeCreateTx, signedReserve, wallet } from './helpers'

const url = process.env.TEST_DATABASE_URL
const d = url ? describe : describe.skip

d('genesis watcher (Postgres)', () => {
  let db: Db
  // chain: signatures per address, newest first (like getSignaturesForAddress)
  let chain: Map<string, { signature: string; err: unknown; blockTime: number }[]>
  let txs: Map<string, any>
  const listSigs: ListSigs = async (addr, { until, limit }) => {
    const all = chain.get(addr) ?? []
    const stop = until ? all.findIndex((s) => s.signature === until) : -1
    return (stop >= 0 ? all.slice(0, stop) : all).slice(0, limit)
  }
  const push = (addr: string, sig: string, tx: any, err: unknown = null) => {
    chain.set(addr, [{ signature: sig, err, blockTime: Math.floor(Date.now() / 1000) }, ...(chain.get(addr) ?? [])])
    txs.set(sig, tx)
  }
  const poll = (creators: string[], maxPerCreator?: number) => pollGenesis({
    db, creators, maxPerCreator, listSigs, fetchTx: async (s) => txs.get(s) ?? null,
    fetchMetadata: async () => ({ image: 'https://ipfs.io/ipfs/genesis-img' }),
  })

  beforeAll(async () => { db = createPool(url!); await migrate(db) })
  afterAll(async () => db?.end())
  beforeEach(async () => {
    await db.query('truncate tickers; truncate genesis_watch')
    chain = new Map(); txs = new Map()
  })

  it('does nothing for a wallet with no creates, but records progress', async () => {
    const g = wallet()
    push(g.pub, 'transfer1', { slot: 1, meta: { err: null }, transaction: { signatures: [], message: { accountKeys: [g.pub], header: { numRequiredSignatures: 1 }, instructions: [] } } })
    expect(await poll([g.pub])).toEqual([])
    const { rows } = await db.query('select * from genesis_watch')
    expect(rows[0]).toMatchObject({ creator: g.pub, last_signature: 'transfer1', registered: 0 })
  })

  it('registers the first create as live genesis coin, listed first, NO VAMPS applies, idempotent', async () => {
    const g = wallet(), mint = wallet(), dev = wallet(), other = wallet()
    // a regular CONDOM coin already exists
    await db.query(`insert into tickers (ticker_norm, ticker_display, creator, status, mint, name, live_at)
      values ('OLD','OLD',$1,'live',$2,'Old Coin', now())`, [dev.pub, other.pub])

    push(g.pub, 'create1', fakeCreateTx({ mint: mint.pub, creator: g.pub, symbol: 'G3N', name: 'Genesis' }))
    const ev = await poll([g.pub])
    expect(ev).toEqual([{ creator: g.pub, mint: mint.pub, symbol: 'G3N', result: 'registered' }])
    expect(await poll([g.pub])).toEqual([]) // idempotent

    const app = createApp({ db, fetchTx: async () => null, rateLimitPerMinute: 10_000 })
    const coins = await (await app.request('/coins')).json()
    expect(coins.items.map((c: any) => [c.mint, c.genesis])).toEqual([[mint.pub, true], [other.pub, false]])
    expect(coins.items[0]).toMatchObject({ name: 'Genesis', symbol: 'G3N', imageUrl: 'https://ipfs.io/ipfs/genesis-img' })
    const { rows } = await db.query('select born_order from tickers where mint = $1', [mint.pub])
    expect(rows[0].born_order).toBe(1)

    // ticker is owned: vamps blocked
    const v = wallet()
    const r = await app.request('/tickers/reserve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticker: 'G3N', ...signedReserve(v, 'G3N') }) })
    expect(r.status).toBe(409)
  })

  it('only the first create per wallet by default; more when allowed', async () => {
    const g = wallet(), m1 = wallet(), m2 = wallet()
    push(g.pub, 'c1', fakeCreateTx({ mint: m1.pub, creator: g.pub, symbol: 'ONE' }))
    push(g.pub, 'c2', fakeCreateTx({ mint: m2.pub, creator: g.pub, symbol: 'TWO' }))
    const ev = await poll([g.pub])
    expect(ev.map((e) => [e.symbol, e.result])).toEqual([['ONE', 'registered']])
    let { rows } = await db.query('select ticker_norm from tickers')
    expect(rows.map((r) => r.ticker_norm)).toEqual(['ONE'])

    await db.query('truncate tickers; truncate genesis_watch')
    await poll([g.pub], 2)
    ;({ rows } = await db.query('select ticker_norm, born_order from tickers order by born_order'))
    expect(rows).toEqual([{ ticker_norm: 'ONE', born_order: 1 }, { ticker_norm: 'TWO', born_order: 2 }])
  })

  it('ignores creates the wallet did not sign, failed txs, and catches CPI creates', async () => {
    const g = wallet(), someone = wallet(), m1 = wallet(), m2 = wallet(), m3 = wallet()
    // someone else's create that merely touches the wallet
    push(g.pub, 'notmine', fakeCreateTx({ mint: m1.pub, creator: someone.pub, symbol: 'NOPE' }))
    push(g.pub, 'failed', fakeCreateTx({ mint: m2.pub, creator: g.pub, symbol: 'FAIL', err: { x: 1 } }), { x: 1 })
    // CPI create via a router program: move the pump ix into innerInstructions
    const tx = fakeCreateTx({ mint: m3.pub, creator: g.pub, symbol: 'CPI' })
    tx.meta = { ...tx.meta, innerInstructions: [{ index: 0, instructions: tx.transaction.message.instructions }] } as any
    tx.transaction.message.instructions = [{ programIdIndex: 2, accounts: [], data: '1' }]
    push(g.pub, 'cpi', tx)
    const ev = await poll([g.pub])
    expect(ev.map((e) => [e.symbol, e.result])).toEqual([['CPI', 'registered']])
  })

  it('genesis overrides a pending reservation but never a live coin', async () => {
    const g = wallet(), r = wallet(), m1 = wallet(), m2 = wallet(), live = wallet()
    await db.query(`insert into tickers (ticker_norm, ticker_display, creator, status, reserved_until)
      values ('HYPE','HYPE',$1,'reserved', now() + interval '10 minutes')`, [r.pub])
    await db.query(`insert into tickers (ticker_norm, ticker_display, creator, status, mint, live_at)
      values ('TAKEN','TAKEN',$1,'live',$2, now())`, [r.pub, live.pub])
    push(g.pub, 'a', fakeCreateTx({ mint: m1.pub, creator: g.pub, symbol: 'TAKEN' }))
    push(g.pub, 'b', fakeCreateTx({ mint: m2.pub, creator: g.pub, symbol: 'HYPE' }))
    const ev = await poll([g.pub])
    expect(ev.map((e) => [e.symbol, e.result])).toEqual([['TAKEN', 'ticker-taken'], ['HYPE', 'registered']])
    const { rows } = await db.query(`select mint, genesis, status from tickers where ticker_norm = 'HYPE'`)
    expect(rows[0]).toEqual({ mint: m2.pub, genesis: true, status: 'live' })
  })

  it('waits when a signature is not fetchable yet, then resumes', async () => {
    const g = wallet(), m = wallet()
    chain.set(g.pub, [{ signature: 'late', err: null, blockTime: 1 }])
    expect(await poll([g.pub])).toEqual([])
    txs.set('late', fakeCreateTx({ mint: m.pub, creator: g.pub, symbol: 'LATE' }))
    expect((await poll([g.pub])).map((e) => e.result)).toEqual(['registered'])
  })
})
