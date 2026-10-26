import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import { PUMP_PROGRAM_ID } from './verify'

/**
 * Live market data for pump.fun coins, read server-side (RPC key never leaves the server).
 * Bonding curve layout (pump IDL BondingCurve, after the 8-byte account discriminator):
 *   virtual_token_reserves u64 @8, virtual_quote_reserves u64 @16, real_token_reserves u64 @24,
 *   real_quote_reserves u64 @32, token_total_supply u64 @40, complete bool @48, creator pubkey @49
 */

export const TOKEN_DECIMALS = 6
export const SOL_DECIMALS = 9
/** global.initial_real_token_reserves on mainnet (793.1M tokens): 100% curve progress = all sold. */
export const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n
/** global.initial_virtual_* on mainnet: price of a fresh coin. */
export const INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000_000_000n
export const INITIAL_VIRTUAL_SOL_RESERVES = 30_000_000_000n
export const WSOL = 'So11111111111111111111111111111111111111112'

const PUMP = new PublicKey(PUMP_PROGRAM_ID)

export function bondingCurvePda(mint: string): string {
  return PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()], PUMP)[0].toBase58()
}

export interface Curve {
  virtualTokenReserves: bigint
  virtualSolReserves: bigint
  realTokenReserves: bigint
  realSolReserves: bigint
  tokenTotalSupply: bigint
  complete: boolean
  creator: string
}

export function decodeCurve(d: Uint8Array): Curve {
  if (d.length < 81) throw new Error('Bonding curve account too short.')
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const u = (o: number) => v.getBigUint64(o, true)
  return {
    virtualTokenReserves: u(8),
    virtualSolReserves: u(16),
    realTokenReserves: u(24),
    realSolReserves: u(32),
    tokenTotalSupply: u(40),
    complete: d[48] === 1,
    creator: bs58.encode(d.subarray(49, 81)),
  }
}

/** SOL per whole token from virtual reserves. */
export function spotPriceSol(vSol: bigint, vTok: bigint): number {
  if (vTok === 0n) return 0
  return (Number(vSol) / 10 ** SOL_DECIMALS) / (Number(vTok) / 10 ** TOKEN_DECIMALS)
}

export const INITIAL_PRICE_SOL = spotPriceSol(INITIAL_VIRTUAL_SOL_RESERVES, INITIAL_VIRTUAL_TOKEN_RESERVES)

export interface CurveMetrics {
  priceSol: number
  marketCapSol: number
  curveProgress: number
  solInCurve: number
  graduated: boolean
  supply: number
}

export function curveMetrics(c: Curve): CurveMetrics {
  const supply = Number(c.tokenTotalSupply) / 10 ** TOKEN_DECIMALS
  const priceSol = spotPriceSol(c.virtualSolReserves, c.virtualTokenReserves)
  const progress = c.complete
    ? 1
    : Math.min(1, Math.max(0, 1 - Number(c.realTokenReserves) / Number(INITIAL_REAL_TOKEN_RESERVES)))
  return {
    priceSol,
    marketCapSol: priceSol * supply,
    curveProgress: progress,
    solInCurve: Number(c.realSolReserves) / 10 ** SOL_DECIMALS,
    graduated: c.complete,
    supply,
  }
}

// ----------------------------------------------------------------- RPC helpers

export type RpcCall = <T = any>(method: string, params: unknown[]) => Promise<T>
export type RpcBatch = <T = any>(calls: { method: string; params: unknown[] }[]) => Promise<(T | null)[]>

export function makeRpc(rpcUrl: string): { call: RpcCall; batch: RpcBatch } {
  let id = 0
  const post = async (body: unknown) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      })
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
        continue
      }
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
      return res.json() as Promise<any>
    }
  }
  const call: RpcCall = async (method, params) => {
    const j = await post({ jsonrpc: '2.0', id: ++id, method, params })
    if (j.error) throw new Error(`RPC ${method}: ${String(j.error.message).slice(0, 200)}`)
    return j.result
  }
  let batchOk = true
  const batch: RpcBatch = async (calls) => {
    if (!calls.length) return []
    if (batchOk) {
      try {
        const j = await post(calls.map((c, i) => ({ jsonrpc: '2.0', id: i, method: c.method, params: c.params })))
        if (Array.isArray(j)) {
          const byId = new Map(j.map((r: any) => [r.id, r]))
          return calls.map((_, i) => (byId.get(i) as any)?.result ?? null)
        }
      } catch (e) {
        if (!/HTTP 4\d\d/.test(String(e))) throw e
      }
      batchOk = false // provider doesn't support batches: fall back to sequential
    }
    const out = []
    for (const c of calls) out.push(await call(c.method, c.params).catch(() => null))
    return out
  }
  return { call, batch }
}

/** Helius API key derived from RPC_URL (server-side only), for DAS calls. */
export function heliusKey(rpcUrl: string): string | null {
  try {
    const u = new URL(rpcUrl)
    return /helius/.test(u.hostname) ? u.searchParams.get('api-key') : null
  } catch {
    return null
  }
}

// ----------------------------------------------------------------- caches

export function ttlCache<V>(ttlMs: number) {
  const m = new Map<string, { at: number; v: Promise<V> }>()
  return async (key: string, load: () => Promise<V>): Promise<V> => {
    const hit = m.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.v
    const v = load()
    m.set(key, { at: Date.now(), v })
    v.catch(() => m.delete(key))
    if (m.size > 2000) for (const k of [...m.keys()].slice(0, 500)) m.delete(k)
    return v
  }
}

// ----------------------------------------------------------------- SOL/USD

const solUsdCache = ttlCache<number | null>(30_000)

export function getSolUsd(fetchImpl: typeof fetch = fetch): Promise<number | null> {
  return solUsdCache('sol', async () => {
    try {
      const r = await fetchImpl(`https://lite-api.jup.ag/price/v3?ids=${WSOL}`, { signal: AbortSignal.timeout(5000) })
      const j = (await r.json()) as any
      const p = Number(j?.[WSOL]?.usdPrice)
      if (p > 0) return p
    } catch {}
    try {
      const r = await fetchImpl('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { signal: AbortSignal.timeout(5000) })
      const j = (await r.json()) as any
      const p = Number(j?.solana?.usd)
      if (p > 0) return p
    } catch {}
    return null
  })
}

// ----------------------------------------------------------------- Dexscreener (graduated)

export interface DexStats { priceUsd: number | null; priceSol: number | null; marketCapUsd: number | null; liquidityUsd: number | null; volume24hUsd: number | null; change24h: number | null; url: string | null; dex: string | null }

const dexCache = ttlCache<DexStats | null>(15_000)

export function getDexStats(mint: string, fetchImpl: typeof fetch = fetch): Promise<DexStats | null> {
  return dexCache(mint, async () => {
    const r = await fetchImpl(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const pairs = (await r.json()) as any[]
    if (!Array.isArray(pairs) || !pairs.length) return null
    const p = pairs.filter((x) => x.dexId !== 'pumpfun').sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] ?? pairs[0]
    const num = (x: unknown) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x))
    return {
      priceUsd: num(p.priceUsd),
      priceSol: p.quoteToken?.address === WSOL ? num(p.priceNative) : null,
      marketCapUsd: num(p.marketCap ?? p.fdv),
      liquidityUsd: num(p.liquidity?.usd),
      volume24hUsd: num(p.volume?.h24),
      change24h: num(p.priceChange?.h24),
      url: p.url ?? null,
      dex: p.dexId ?? null,
    }
  })
}
