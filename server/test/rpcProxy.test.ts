import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { redact, RPC_MAX_BATCH } from '../src/rpcProxy'

const UPSTREAM = 'https://mainnet.helius-rpc.com/?api-key=abcd1234-SECRET-KEY-0000-ffffffffffff'
const ORIGIN = 'https://thecondom.fun'

function setup(opts: { upstream?: (body: any) => Response | Promise<Response>; rpcLimit?: number } = {}) {
  const calls: any[] = []
  const rpcFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    if (opts.upstream) return opts.upstream(JSON.parse(String(init.body)))
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value: 42 } }), { headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  const app = createApp({ db: {} as any, fetchTx: async () => null, rpcUpstream: UPSTREAM, rpcFetch, rpcRateLimitPerMinute: opts.rpcLimit ?? 10_000 })
  const rpc = (body: unknown, headers: Record<string, string> = {}) => app.request('/rpc', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '1.2.3.4', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return { app, rpc, calls }
}
const req = (method: string, params: unknown[] = [], id = 1) => ({ jsonrpc: '2.0', id, method, params })

describe('POST /rpc proxy', () => {
  it('forwards allowed methods to the upstream and returns its response', async () => {
    const { rpc, calls } = setup()
    for (const m of ['getLatestBlockhash', 'sendTransaction', 'simulateTransaction', 'getSignatureStatuses', 'getSlot', 'getAccountInfo', 'getMultipleAccounts', 'getBlockHeight']) {
      const r = await rpc(req(m))
      expect(r.status, m).toBe(200)
    }
    expect(calls).toHaveLength(8)
    expect(calls[0].url).toBe(UPSTREAM)
  })

  it('rejects methods outside the allowlist without calling upstream', async () => {
    const { rpc, calls } = setup()
    for (const m of ['getProgramAccounts', 'getSignaturesForAddress', 'requestAirdrop', 'getLargestAccounts', 'getBlock', 'accountSubscribe']) {
      const r = await rpc(req(m))
      expect(r.status, m).toBe(403)
      expect((await r.json()).error.message).toMatch(/not allowed/)
    }
    expect(calls).toHaveLength(0)
  })

  it('caps batches and rejects a batch hiding a forbidden method', async () => {
    const { rpc, calls } = setup()
    expect((await rpc(Array.from({ length: RPC_MAX_BATCH }, (_, i) => req('getSlot', [], i)))).status).toBe(200)
    expect((await rpc(Array.from({ length: RPC_MAX_BATCH + 1 }, (_, i) => req('getSlot', [], i)))).status).toBe(400)
    expect((await rpc([])).status).toBe(400)
    expect((await rpc([req('getSlot'), req('getProgramAccounts')])).status).toBe(403)
    expect(calls).toHaveLength(1)
  })

  it('rejects malformed bodies, huge bodies and too many accounts', async () => {
    const { rpc } = setup()
    expect((await rpc('not json')).status).toBe(400)
    expect((await rpc({ method: 'getSlot' })).status).toBe(400)
    expect((await rpc(req('getSlot', 'x' as any))).status).toBe(400)
    expect((await rpc(req('sendTransaction', ['A'.repeat(70_000)]))).status).toBe(413)
    expect((await rpc(req('getMultipleAccounts', [Array.from({ length: 101 }, () => '11111111111111111111111111111111')]))).status).toBe(400)
  })

  it('only serves allowed browser origins (CORS + Origin check)', async () => {
    const { rpc, app, calls } = setup()
    expect((await rpc(req('getSlot'), { origin: 'https://evil.example' })).status).toBe(403)
    expect((await app.request('/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req('getSlot')) })).status).toBe(403)
    expect((await rpc(req('getSlot'), { origin: 'https://www.thecondom.fun' })).status).toBe(200)
    expect((await rpc(req('getSlot'), { origin: 'http://localhost:5173' })).status).toBe(200)
    const pre = await app.request('/rpc', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,solana-client' } })
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(pre.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('solana-client')
    expect(calls).toHaveLength(2)
  })

  it('rate limits per IP', async () => {
    const { rpc } = setup({ rpcLimit: 3 })
    const codes = []
    for (let i = 0; i < 5; i++) codes.push((await rpc(req('getSlot'))).status)
    expect(codes).toEqual([200, 200, 200, 429, 429])
    expect((await rpc(req('getSlot'), { 'x-forwarded-for': '5.6.7.8' })).status).toBe(200)
  })

  it('never leaks the upstream URL or key, even if upstream echoes it or fails', async () => {
    const echo = setup({ upstream: () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -1, message: `bad request to ${UPSTREAM}` } }), { status: 400 }) })
    const t1 = await (await echo.rpc(req('getSlot'))).text()
    expect(t1).not.toContain('helius')
    expect(t1).not.toContain('SECRET')

    const down = setup({ upstream: () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }) } })
    const r2 = await down.rpc(req('getSlot'))
    expect(r2.status).toBe(502)
    const t2 = await r2.text()
    expect(t2).not.toContain('helius')

    const html = setup({ upstream: () => new Response('<html>401 for ' + UPSTREAM + '</html>', { status: 401 }) })
    const t3 = await (await html.rpc(req('getSlot'))).text()
    expect(t3).not.toContain('helius')
    expect(t3).not.toContain('SECRET')

    const busy = setup({ upstream: () => new Response('rate limited', { status: 429 }) })
    expect((await busy.rpc(req('getSlot'))).status).toBe(429)
  })

  it('redact() strips host, query and key values', () => {
    const s = redact(`x ${UPSTREAM} y mainnet.helius-rpc.com z abcd1234-SECRET-KEY-0000-ffffffffffff api_key=zzz`, UPSTREAM)
    expect(s).not.toMatch(/helius|SECRET|zzz/)
  })

  it('/rpc is not mounted without an upstream', async () => {
    const app = createApp({ db: {} as any, fetchTx: async () => null })
    expect((await app.request('/rpc', { method: 'POST', headers: { origin: ORIGIN }, body: '{}' })).status).toBe(404)
  })
})
