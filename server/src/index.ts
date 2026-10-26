import { serve } from '@hono/node-server'
import { createApp, defaultFetchMetadata, DEFAULT_ORIGINS } from './app'
import { rpcListSigs, startGenesisWatcher } from './genesis'
import { createPool, migrate, purgeExpired } from './db'
import { isPubkey, rpcFetchTx } from './verify'
import { makeRpc } from './market'
import { createLive } from './live'
import { startTradeIndexer } from './trades'

const env = (k: string) => process.env[k]?.trim() || undefined

const databaseUrl = env('DATABASE_URL')
if (!databaseUrl) throw new Error('DATABASE_URL is not set')
const rpcUrl = env('RPC_URL') ?? 'https://api.mainnet-beta.solana.com'
const extraOrigins = (env('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const db = createPool(databaseUrl)
await migrate(db)

const rpc = makeRpc(rpcUrl)
const live = createLive({ db, call: rpc.call, batch: rpc.batch, rpcUrl })

const app = createApp({
  live,
  db,
  fetchTx: rpcFetchTx(rpcUrl),
  pinataJwt: env('PINATA_JWT'),
  allowedOrigins: [...DEFAULT_ORIGINS, ...extraOrigins],
  rpcUpstream: rpcUrl,
})

const genesisCreators = (env('GENESIS_CREATORS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
for (const c of genesisCreators) if (!isPubkey(c)) throw new Error(`GENESIS_CREATORS: invalid address ${c}`)
if (genesisCreators.length) {
  startGenesisWatcher({
    db,
    creators: genesisCreators,
    maxPerCreator: Number(env('GENESIS_MAX_PER_CREATOR') ?? 1),
    listSigs: rpcListSigs(rpcUrl),
    fetchTx: rpcFetchTx(rpcUrl),
    fetchMetadata: defaultFetchMetadata,
    log: console.log,
  }, Number(env('GENESIS_POLL_MS') ?? 20_000))
  console.log(`genesis watcher on for ${genesisCreators.length} wallet(s)`)
}

if (env('TRADE_INDEXER') !== 'off') {
  startTradeIndexer({ db, call: rpc.call, batch: rpc.batch, rpcUrl, isGraduated: live.isGraduated, log: console.log }, Number(env('TRADE_POLL_MS') ?? 5000))
  console.log('trade indexer on')
}

setInterval(() => purgeExpired(db).catch((e) => console.error('purge failed', e)), 60_000).unref()

const port = Number(env('PORT') ?? 8080)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`condom-registry listening on :${port} (rpc ${env('RPC_URL') ? 'custom' : 'public default'}, pinata ${env('PINATA_JWT') ? 'on' : 'off'})`)
})
