import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { createPool, migrate, reserveTicker, type Db } from '../src/db'
import { fakeCreateTx, signedReserve, wallet } from './helpers'

const url = process.env.TEST_DATABASE_URL
const d = url ? describe : describe.skip

d('registry (Postgres)', () => {
  let db: Db
  let txs: Map<string, any>
  let app: ReturnType<typeof createApp>
  const origin = 'https://thecondom.fun'
  const post = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) })

  beforeAll(async () => {
    db = createPool(url!)
    await migrate(db)
  })
  afterAll(async () => db?.end())
  beforeEach(async () => {
    await db.query('truncate tickers')
    txs = new Map()
    app = createApp({ db, fetchTx: async (s) => txs.get(s) ?? null, fetchMetadata: async () => ({ image: 'https://ipfs.io/ipfs/img' }), rateLimitPerMinute: 10_000 })
  })

  it('uniqueness race: 25 wallets reserve lookalikes of one ticker at once, exactly one wins', async () => {
    const variants = ['PEPE', '$pepe', 'РЕРЕ', 'ΡΕΡΕ', 'PE\u200BPE', 'ＰＥＰＥ', ' pepe ']
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => {
        const w = wallet()
        return reserveTicker(db, { norm: 'PEPE', display: variants[i % variants.length], creator: w.pub, minutes: 10 })
      }),
    )
    expect(results.filter(Boolean)).toHaveLength(1)
    const { rows } = await db.query('select count(*)::int as n from tickers')
    expect(rows[0].n).toBe(1)
  })

  it('race through the API: concurrent signed reserves of lookalikes, one 200, rest 409', async () => {
    const variants = ['BONK', 'B0NK', 'bonk', '$BONK', 'ВОNК']
    const res = await Promise.all(variants.map((v) => {
      const w = wallet()
      return post('/tickers/reserve', { ticker: v, ...signedReserve(w, v.replace(/^\$/, '').toUpperCase()) })
    }))
    const codes = res.map((r) => r.status).sort()
    expect(codes).toEqual([200, 409, 409, 409, 409])
  })

  it('full flow: check -> reserve -> confirm -> taken -> /coins', async () => {
    const w = wallet(), mint = wallet()
    let r = await app.request('/tickers/%24moon', { headers: { origin } })
    expect(await r.json()).toMatchObject({ available: true, normalized: 'MOON' })

    r = await post('/tickers/reserve', { ticker: 'MOON', ...signedReserve(w, 'MOON') })
    expect(r.status).toBe(200)

    // another wallet sees it reserved, the owner sees it as theirs
    r = await app.request('/tickers/M00N')
    expect(await r.json()).toMatchObject({ available: false, status: 'reserved' })
    r = await app.request(`/tickers/MOON?creator=${w.pub}`)
    expect(await r.json()).toMatchObject({ available: true, reservedByYou: true })

    txs.set('sig1', fakeCreateTx({ mint: mint.pub, creator: w.pub, symbol: 'MOON', name: 'Moon Coin' }))
    r = await post('/tickers/confirm', { ticker: 'MOON', mint: mint.pub, signature: 'sig1' })
    expect(r.status).toBe(200)
    expect((await r.json()).coin).toMatchObject({ mint: mint.pub, symbol: 'MOON', name: 'Moon Coin', imageUrl: 'https://ipfs.io/ipfs/img' })

    r = await app.request('/tickers/m0on')
    expect(await r.json()).toMatchObject({ available: false, status: 'live', coin: { mint: mint.pub } })

    // a vamp can't reserve it
    const vamp = wallet()
    r = await post('/tickers/reserve', { ticker: 'MΟΟN', ...signedReserve(vamp, 'MΟΟN') })
    expect(r.status).toBe(409)

    r = await app.request('/coins')
    const coins = await r.json()
    expect(coins.items).toHaveLength(1)
    expect(coins.items[0].mint).toBe(mint.pub)
  })

  it('confirm rejects a symbol mismatch, an unreserved ticker, and a mint reused for a second ticker', async () => {
    const w = wallet(), mint = wallet()
    await post('/tickers/reserve', { ticker: 'AAA', ...signedReserve(w, 'AAA') })
    txs.set('bad', fakeCreateTx({ mint: mint.pub, creator: w.pub, symbol: 'BBB' }))
    let r = await post('/tickers/confirm', { ticker: 'AAA', mint: mint.pub, signature: 'bad' })
    expect(r.status).toBe(422)

    r = await post('/tickers/confirm', { ticker: 'ZZZ', mint: mint.pub, signature: 'bad' })
    expect(r.status).toBe(409)

    txs.set('good', fakeCreateTx({ mint: mint.pub, creator: w.pub, symbol: 'AAA' }))
    r = await post('/tickers/confirm', { ticker: 'AAA', mint: mint.pub, signature: 'good' })
    expect(r.status).toBe(200)
    // idempotent
    r = await post('/tickers/confirm', { ticker: 'AAA', mint: mint.pub, signature: 'good' })
    expect(r.status).toBe(200)

    await post('/tickers/reserve', { ticker: 'CCC', ...signedReserve(w, 'CCC') })
    txs.set('reuse', fakeCreateTx({ mint: mint.pub, creator: w.pub, symbol: 'CCC' }))
    r = await post('/tickers/confirm', { ticker: 'CCC', mint: mint.pub, signature: 'reuse' })
    expect(r.status).toBe(409)
  })

  it('expired reservations free up for another wallet', async () => {
    const a = wallet(), b = wallet()
    await post('/tickers/reserve', { ticker: 'EXP', ...signedReserve(a, 'EXP') })
    let r = await post('/tickers/reserve', { ticker: 'EXP', ...signedReserve(b, 'EXP') })
    expect(r.status).toBe(409)
    await db.query(`update tickers set reserved_until = now() - interval '1 second'`)
    r = await app.request('/tickers/EXP')
    expect(await r.json()).toMatchObject({ available: true })
    r = await post('/tickers/reserve', { ticker: 'EXP', ...signedReserve(b, 'EXP') })
    expect(r.status).toBe(200)
  })

  it('CORS only allows thecondom.fun, www and localhost', async () => {
    const allowed = async (o: string) => (await app.request('/coins', { headers: { origin: o } })).headers.get('access-control-allow-origin')
    expect(await allowed('https://thecondom.fun')).toBe('https://thecondom.fun')
    expect(await allowed('https://www.thecondom.fun')).toBe('https://www.thecondom.fun')
    expect(await allowed('http://localhost:5173')).toBe('http://localhost:5173')
    expect(await allowed('https://evil.example')).toBeNull()
  })

  it('rate limits', async () => {
    const limited = createApp({ db, fetchTx: async () => null, rateLimitPerMinute: 3 })
    const codes = []
    for (let i = 0; i < 5; i++) codes.push((await limited.request('/coins', { headers: { 'x-forwarded-for': '9.9.9.9' } })).status)
    expect(codes).toEqual([200, 200, 200, 429, 429])
  })
})
