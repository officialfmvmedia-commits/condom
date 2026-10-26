import {
  genesisMissingImages, getWatch, registerGenesis, setImage, setWatch, type Db, type GenesisResult,
} from './db'
import { displayTicker, normalizeTicker } from './normalize'
import { findCreates, type FetchTx } from './verify'

/**
 * Genesis watcher: coins created by GENESIS_CREATORS wallets are auto-registered as live,
 * "born on CONDOM" coins (first in /coins), even without going through reserve/confirm.
 */

export type ListSigs = (address: string, opts: { until?: string; before?: string; limit: number }) =>
  Promise<{ signature: string; err: unknown; blockTime?: number | null }[]>

export function rpcListSigs(rpcUrl: string): ListSigs {
  return async (address, opts) => {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [address, { ...opts, commitment: 'confirmed' }] }),
    })
    if (!res.ok) throw new Error(`RPC error ${res.status}`)
    const j = (await res.json()) as { result?: any[]; error?: { message: string } }
    if (j.error) throw new Error(`RPC error: ${j.error.message}`)
    return j.result ?? []
  }
}

export interface GenesisDeps {
  db: Db
  creators: string[]
  /** How many creates per creator are auto-registered. Default 1 (first only). */
  maxPerCreator?: number
  listSigs: ListSigs
  fetchTx: FetchTx
  fetchMetadata: (uri: string) => Promise<{ image?: string } | null>
  log?: (msg: string) => void
}

export interface GenesisEvent { creator: string; mint: string; symbol: string; result: GenesisResult | 'skipped' }

/** All signatures newer than `until` (exclusive), oldest first. Pages back fully on first run. */
async function newSignatures(listSigs: ListSigs, address: string, until?: string) {
  const out: { signature: string; err: unknown; blockTime?: number | null }[] = []
  let before: string | undefined
  for (let page = 0; page < 20; page++) {
    const batch = await listSigs(address, { until, before, limit: 1000 })
    out.push(...batch)
    if (batch.length < 1000) break
    before = batch[batch.length - 1].signature
  }
  return out.reverse()
}

/** One poll over all genesis creators. Safe to run repeatedly (idempotent). */
export async function pollGenesis(d: GenesisDeps): Promise<GenesisEvent[]> {
  const max = d.maxPerCreator ?? 1
  const log = d.log ?? (() => {})
  const events: GenesisEvent[] = []
  for (const creator of d.creators) {
    const watch = await getWatch(d.db, creator)
    let registered = watch?.registered ?? 0
    let last = watch?.last_signature ?? null
    const sigs = await newSignatures(d.listSigs, creator, last ?? undefined)
    for (const s of sigs) {
      if (!s.err && registered < max) {
        const tx = await d.fetchTx(s.signature)
        if (!tx) break // not visible yet at this commitment; retry next poll from here
        const { signers, creates } = findCreates(tx)
        for (const c of creates) {
          if (!signers.includes(creator) || (c.user !== creator && c.creator !== creator)) continue
          if (registered >= max) {
            events.push({ creator, mint: c.mint, symbol: c.symbol, result: 'skipped' })
            continue
          }
          let norm: string
          try {
            norm = normalizeTicker(c.symbol)
          } catch {
            norm = c.symbol.trim().toUpperCase() || c.mint
          }
          let image: string | null = null
          try {
            image = (await d.fetchMetadata(c.uri))?.image ?? null
          } catch {}
          const result = await registerGenesis(d.db, {
            norm, display: displayTicker(c.symbol) || c.symbol, creator, mint: c.mint, signature: s.signature,
            name: c.name, uri: c.uri, image, liveAt: s.blockTime ? new Date(s.blockTime * 1000) : new Date(),
          })
          if (result !== 'ticker-taken') registered++
          events.push({ creator, mint: c.mint, symbol: c.symbol, result })
          log(`genesis: ${creator} created $${c.symbol} ${c.mint} -> ${result}`)
        }
      }
      last = s.signature
      await setWatch(d.db, creator, last, registered)
    }
    if (!watch && sigs.length === 0) await setWatch(d.db, creator, null, 0)
  }
  // IPFS gateways can be slow right after launch; keep trying images for genesis coins.
  for (const m of await genesisMissingImages(d.db)) {
    try {
      const img = (await d.fetchMetadata(m.uri))?.image
      if (img) await setImage(d.db, m.mint, img)
    } catch {}
  }
  return events
}

/** Runs pollGenesis every `intervalMs`, never overlapping, guarded by a Postgres advisory lock. */
export function startGenesisWatcher(d: GenesisDeps, intervalMs = 20_000): () => void {
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  const tick = async () => {
    const client = await d.db.connect().catch(() => null)
    try {
      if (client && (await client.query('select pg_try_advisory_lock(727001) as ok')).rows[0].ok) {
        try {
          await pollGenesis(d)
        } finally {
          await client.query('select pg_advisory_unlock(727001)')
        }
      }
    } catch (e) {
      console.error('genesis poll failed:', e instanceof Error ? e.message : e)
    } finally {
      client?.release()
      if (!stopped) timer = setTimeout(tick, intervalMs)
    }
  }
  timer = setTimeout(tick, 1000)
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
