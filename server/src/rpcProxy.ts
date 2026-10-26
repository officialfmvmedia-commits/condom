import type { Context } from 'hono'

/**
 * JSON-RPC proxy so the paid RPC key (RPC_URL, e.g. Helius) stays server-side.
 * Only methods the CONDOM frontend actually uses are forwarded (audited from src/ and
 * @pump-fun/pump-sdk: web3.js Connection + OnlinePumpSdk). No websockets: the frontend
 * confirms by polling getSignatureStatuses.
 */
export const RPC_METHOD_ALLOWLIST = new Set([
  // tx lifecycle
  'getLatestBlockhash', 'isBlockhashValid', 'sendTransaction', 'simulateTransaction',
  'getSignatureStatuses', 'getBlockHeight', 'getSlot', 'getEpochInfo',
  'getFeeForMessage', 'getRecentPrioritizationFees',
  // account reads (pump-sdk fetchGlobal/fetchFeeConfig/fetchBuyState, spl-token)
  'getAccountInfo', 'getMultipleAccounts', 'getBalance', 'getTokenAccountBalance',
  'getTokenSupply', 'getMinimumBalanceForRentExemption',
  // misc read-only, cheap
  'getTransaction', 'getGenesisHash', 'getVersion', 'getHealth',
])

export const RPC_MAX_BODY_BYTES = 64 * 1024
export const RPC_MAX_BATCH = 10

type RpcReq = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }

const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** Validates a JSON-RPC body; returns an error response body or null when OK. */
export function validateRpcBody(body: unknown): { status: number; body: unknown } | null {
  const items: RpcReq[] = Array.isArray(body) ? body : [body as RpcReq]
  if (Array.isArray(body) && (body.length === 0 || body.length > RPC_MAX_BATCH)) {
    return { status: 400, body: rpcError(null, -32600, `Batch must have 1-${RPC_MAX_BATCH} requests.`) }
  }
  for (const it of items) {
    if (!it || typeof it !== 'object' || it.jsonrpc !== '2.0' || typeof it.method !== 'string') {
      return { status: 400, body: rpcError((it as RpcReq)?.id, -32600, 'Invalid JSON-RPC request.') }
    }
    if (!RPC_METHOD_ALLOWLIST.has(it.method)) {
      return { status: 403, body: rpcError(it.id, -32601, `Method not allowed: ${String(it.method).slice(0, 64)}`) }
    }
    if (it.params !== undefined && !Array.isArray(it.params)) {
      return { status: 400, body: rpcError(it.id, -32602, 'params must be an array.') }
    }
    // getMultipleAccounts is the only fan-out read; keep it to web3.js' own max of 100 keys.
    if (it.method === 'getMultipleAccounts' && Array.isArray(it.params?.[0]) && (it.params![0] as unknown[]).length > 100) {
      return { status: 400, body: rpcError(it.id, -32602, 'Too many accounts.') }
    }
  }
  return null
}

/** Strip anything that could carry the upstream URL (key in query string) out of a message. */
export function redact(msg: string, upstream: string): string {
  let out = msg
  try {
    const u = new URL(upstream)
    for (const s of [upstream, u.origin + u.pathname, u.search, u.host]) if (s) out = out.split(s).join('[rpc]')
    for (const v of u.searchParams.values()) if (v) out = out.split(v).join('[redacted]')
  } catch {}
  return out.replace(/api[-_]?key=[^&\s"']+/gi, 'api-key=[redacted]')
}

export function rpcProxyHandler(upstream: string, fetchImpl: typeof fetch = fetch) {
  return async (c: Context) => {
    const raw = await c.req.text()
    if (raw.length > RPC_MAX_BODY_BYTES) return c.json(rpcError(null, -32600, 'Request too large.'), 413)
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return c.json(rpcError(null, -32700, 'Parse error.'), 400)
    }
    const bad = validateRpcBody(body)
    if (bad) return c.json(bad.body as object, bad.status as 400)
    let res: Response
    try {
      res = await fetchImpl(upstream, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
        signal: AbortSignal.timeout(25_000),
      })
    } catch (e) {
      const code = (e as { cause?: { code?: string } })?.cause?.code ?? (e as Error)?.name ?? 'error'
      console.error(`rpc proxy: upstream unreachable (${redact(String(code), upstream)})`)
      return c.json(rpcError(null, -32603, 'RPC unavailable. Try again.'), 502)
    }
    const text = redact(await res.text(), upstream)
    if (res.status === 429) return c.json(rpcError(null, -32005, 'RPC is busy. Try again in a moment.'), 429)
    if (!res.ok && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.error(`rpc proxy: upstream HTTP ${res.status}`)
      return c.json(rpcError(null, -32603, `RPC error (${res.status}).`), 502)
    }
    return c.body(text, res.status as 200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  }
}
