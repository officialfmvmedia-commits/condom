import { API_URL } from './config'
import type { TokenSummary } from './launchpad/types'

/** Client for the CONDOM API (ticker registry, IPFS upload, coin list). */

export class ApiError extends Error {
  status: number
  body?: any
  constructor(message: string, status: number, body?: any) { super(message); this.status = status; this.body = body }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_URL + path, init)
  } catch {
    throw new ApiError("Can't reach the CONDOM API. Check your connection and try again.", 0)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body?.error || `CONDOM API error (${res.status}).`, res.status, body)
  return body as T
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export type CoinJson = TokenSummary & { signature?: string | null }

export type TickerStatus =
  | { ticker: string; normalized: string; available: true; status: 'available' }
  | { ticker: string; normalized: string; available: boolean; status: 'reserved'; reservedByYou?: boolean; reservedUntil?: string }
  | { ticker: string; normalized: string; available: false; status: 'live'; coin: CoinJson }

export function checkTicker(ticker: string, creator?: string, signal?: AbortSignal): Promise<TickerStatus> {
  const q = creator ? `?creator=${encodeURIComponent(creator)}` : ''
  return call(`/tickers/${encodeURIComponent(ticker)}${q}`, { signal })
}

/** Must match server/src/verify.ts reserveMessage(). */
export const reserveMessage = (display: string, creator: string, issuedAt: string) =>
  `CONDOM: reserve $${display} for ${creator}\nissued: ${issuedAt}`

export async function reserveTicker(
  ticker: string,
  creator: string,
  signMessage: (m: Uint8Array) => Promise<Uint8Array>,
): Promise<{ reservedUntil: string }> {
  const display = ticker.normalize('NFKC').trim().replace(/^\$+/, '').trim().toUpperCase()
  const message = reserveMessage(display, creator, new Date().toISOString())
  const sig = await signMessage(new TextEncoder().encode(message))
  const signature = btoa(String.fromCharCode(...sig))
  return call('/tickers/reserve', json({ ticker: display, creator, message, signature }))
}

export function confirmTicker(ticker: string, creator: string, mint: string, signature: string): Promise<{ ok: true; coin: CoinJson }> {
  return call('/tickers/confirm', json({ ticker, creator, mint, signature }))
}

export async function uploadMetadata(m: {
  image: File; name: string; symbol: string; description: string; twitter?: string; telegram?: string; website?: string
}): Promise<{ metadataUri: string; imageUri: string }> {
  const fd = new FormData()
  fd.append('file', m.image)
  fd.append('name', m.name)
  fd.append('symbol', m.symbol)
  fd.append('description', m.description)
  if (m.twitter) fd.append('twitter', m.twitter)
  if (m.telegram) fd.append('telegram', m.telegram)
  if (m.website) fd.append('website', m.website)
  return call('/ipfs', { method: 'POST', body: fd })
}

export async function listCoins(limit = 60): Promise<CoinJson[]> {
  return (await call<{ items: CoinJson[] }>(`/coins?limit=${limit}`)).items
}

export async function getCoin(mint: string): Promise<CoinJson | null> {
  try {
    return await call<CoinJson>(`/coins/${encodeURIComponent(mint)}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

// ----------------------------------------------------------------- live market data

export interface CoinStats {
  mint: string
  priceSol: number | null
  priceUsd: number | null
  marketCapSol: number | null
  marketCapUsd: number | null
  solUsd: number | null
  curveProgress: number | null
  solInCurve: number | null
  graduated: boolean
  change24h: number | null
  volume24hSol: number
  volume24hUsd: number | null
  txns24h: number
  buys24h: number
  sells24h: number
  txns: number
  athMarketCapSol: number | null
  athMarketCapUsd: number | null
  liquidityUsd: number | null
  dexUrl: string | null
  holderCount: number | null
  updatedAt: number
}

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; trades: number }
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

const enc = encodeURIComponent
export const getStats = (mint: string) => call<CoinStats>(`/coins/${enc(mint)}/stats`)
export const getTradesApi = async (mint: string, limit = 50) =>
  (await call<{ items: import('./launchpad/types').Trade[] }>(`/coins/${enc(mint)}/trades?limit=${limit}`)).items
export const getCandles = (mint: string, tf: Timeframe) =>
  call<{ tf: Timeframe; unit: 'usd' | 'sol'; items: Candle[] }>(`/coins/${enc(mint)}/candles?tf=${tf}`)
export const getHoldersApi = (mint: string) =>
  call<{ items: import('./launchpad/types').Holder[]; count: number | null }>(`/coins/${enc(mint)}/holders`)
