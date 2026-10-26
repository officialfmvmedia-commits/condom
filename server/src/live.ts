import type { Db } from './db'
import {
  bondingCurvePda, curveMetrics, decodeCurve, getDexStats, getSolUsd, heliusKey, INITIAL_PRICE_SOL, ttlCache,
  type CurveMetrics, type DexStats, type RpcBatch, type RpcCall,
} from './market'
import { bulkTradeStats, tradeStats } from './trades'

export interface LiveDeps {
  db: Db
  call: RpcCall
  batch: RpcBatch
  rpcUrl: string
  fetchImpl?: typeof fetch
}

export interface HolderJson { owner: string; tokenAccount: string; amount: number; pct: number; tag?: 'curve' | 'dev' }

export function createLive(d: LiveDeps) {
  const curveCache = ttlCache<CurveMetrics & { creator: string } | null>(2500)
  const holderCache = ttlCache<HolderJson[]>(15_000)
  const countCache = ttlCache<number | null>(60_000)
  const fetchImpl = d.fetchImpl ?? fetch

  const readCurve = (mint: string) => curveCache(mint, async () => {
    const r = await d.call<any>('getAccountInfo', [bondingCurvePda(mint), { encoding: 'base64', commitment: 'confirmed' }])
    if (!r?.value) return null
    const c = decodeCurve(Buffer.from(r.value.data[0], 'base64'))
    return { ...curveMetrics(c), creator: c.creator }
  })

  /** Curves for many mints in one getMultipleAccounts call (<=100). */
  const readCurves = async (mints: string[]) => {
    const out = new Map<string, CurveMetrics>()
    for (let i = 0; i < mints.length; i += 100) {
      const part = mints.slice(i, i + 100)
      const r = await d.call<any>('getMultipleAccounts', [part.map(bondingCurvePda), { encoding: 'base64', commitment: 'confirmed' }])
      r?.value?.forEach((acc: any, j: number) => {
        if (acc) try { out.set(part[j], curveMetrics(decodeCurve(Buffer.from(acc.data[0], 'base64')))) } catch {}
      })
    }
    return out
  }
  const bulkCache = ttlCache<Map<string, CurveMetrics>>(8000)

  const isGraduated = async (mint: string) => !!(await readCurve(mint).catch(() => null))?.graduated

  async function stats(mint: string) {
    const [curve, solUsd, t] = await Promise.all([readCurve(mint), getSolUsd(fetchImpl), tradeStats(d.db, mint)])
    let dex: DexStats | null = null
    if (curve?.graduated) dex = await getDexStats(mint, fetchImpl).catch(() => null)
    const priceSol = dex?.priceSol ?? curve?.priceSol ?? null
    const marketCapSol = priceSol != null && curve ? priceSol * curve.supply : null
    const ref = t.price_24h_ago ?? (t.first_trade ? INITIAL_PRICE_SOL : null)
    const change24h = dex?.change24h ?? (priceSol != null && ref ? ((priceSol - ref) / ref) * 100 : null)
    const athSol = Math.max(t.ath_mcap ?? 0, marketCapSol ?? 0) || null
    return {
      mint,
      priceSol,
      priceUsd: dex?.priceUsd ?? (priceSol != null && solUsd ? priceSol * solUsd : null),
      marketCapSol,
      marketCapUsd: dex?.marketCapUsd ?? (marketCapSol != null && solUsd ? marketCapSol * solUsd : null),
      solUsd,
      curveProgress: curve?.curveProgress ?? null,
      solInCurve: curve?.solInCurve ?? null,
      graduated: curve?.graduated ?? false,
      change24h,
      volume24hSol: t.volume24h,
      volume24hUsd: dex?.volume24hUsd ?? (solUsd ? t.volume24h * solUsd : null),
      txns24h: t.txns24h,
      buys24h: t.buys24h,
      sells24h: t.sells24h,
      txns: t.txns,
      athMarketCapSol: athSol,
      athMarketCapUsd: athSol != null && solUsd ? athSol * solUsd : null,
      liquidityUsd: dex?.liquidityUsd ?? null,
      dexUrl: dex?.url ?? null,
      holderCount: await holderCount(mint).catch(() => null),
      updatedAt: Date.now(),
    }
  }

  /** Live fields for the home grid, one RPC call for all curves. */
  async function gridStats(mints: string[]) {
    const key = mints.join(',')
    const [curves, solUsd, t] = await Promise.all([
      bulkCache(key, () => readCurves(mints)).catch(() => new Map<string, CurveMetrics>()),
      getSolUsd(fetchImpl),
      bulkTradeStats(d.db, mints),
    ])
    const out = new Map<string, { priceSol: number | null; marketCapSol: number | null; marketCapUsd: number | null; curveProgress: number | null; graduated: boolean; change24h: number | null; volume24hSol: number }>()
    for (const m of mints) {
      const c = curves.get(m)
      const s = t.get(m)
      const ref = s?.price24hAgo ?? (s?.ath != null ? INITIAL_PRICE_SOL : null)
      out.set(m, {
        priceSol: c?.priceSol ?? null,
        marketCapSol: c?.marketCapSol ?? null,
        marketCapUsd: c && solUsd ? c.marketCapSol * solUsd : null,
        curveProgress: c?.curveProgress ?? null,
        graduated: c?.graduated ?? false,
        change24h: c && ref ? ((c.priceSol - ref) / ref) * 100 : null,
        volume24hSol: s?.volume24h ?? 0,
      })
    }
    return out
  }

  async function holders(mint: string, limit = 20): Promise<HolderJson[]> {
    return holderCache(`${mint}:${limit}`, async () => {
      const [largest, supply, curve] = await Promise.all([
        d.call<any>('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]),
        d.call<any>('getTokenSupply', [mint, { commitment: 'confirmed' }]),
        readCurve(mint).catch(() => null),
      ])
      const accts: { address: string; amount: string; uiAmount: number }[] = (largest?.value ?? []).filter((a: any) => Number(a.amount) > 0).slice(0, limit)
      const total = Number(supply?.value?.amount ?? 0)
      const infos = await d.call<any>('getMultipleAccounts', [accts.map((a) => a.address), { encoding: 'jsonParsed', commitment: 'confirmed' }])
      const curvePda = bondingCurvePda(mint)
      const { rows } = await d.db.query('select creator from tickers where mint = $1', [mint])
      const creator = curve?.creator ?? rows[0]?.creator
      return accts.map((a, i) => {
        const owner: string = infos?.value?.[i]?.data?.parsed?.info?.owner ?? a.address
        const tag = owner === curvePda ? 'curve' as const : owner === creator ? 'dev' as const : undefined
        return { owner, tokenAccount: a.address, amount: Number(a.amount) / 1e6, pct: total ? (Number(a.amount) / total) * 100 : 0, ...(tag ? { tag } : {}) }
      })
    })
  }

  /** Holder count via Helius DAS getTokenAccounts (only when RPC_URL is Helius). Capped at 10k. */
  async function holderCount(mint: string): Promise<number | null> {
    if (!heliusKey(d.rpcUrl)) return null
    return countCache(mint, async () => {
      let n = 0
      for (let page = 1; page <= 10; page++) {
        const r = await d.call<any>('getTokenAccounts', { mint, page, limit: 1000, options: { showZeroBalance: false } } as any)
        const list = r?.token_accounts ?? []
        n += list.filter((a: any) => Number(a.amount) > 0).length
        if (list.length < 1000) break
      }
      return n
    })
  }

  return { readCurve, isGraduated, stats, gridStats, holders, holderCount }
}

export type Live = ReturnType<typeof createLive>
