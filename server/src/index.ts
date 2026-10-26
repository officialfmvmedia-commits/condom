import { serve } from '@hono/node-server'
import { createApp, defaultFetchMetadata, DEFAULT_ORIGINS } from './app'
import { rpcListSigs, startGenesisWatcher } from './genesis'
import { createPool, migrate, purgeExpired } from './db'
import { isPubkey, rpcFetchTx } from './verify'

const env = (k: string) => process.env[k]?.trim() || undefined

const databaseUrl = env('DATABASE_URL')
if (!databaseUrl) throw new Error('DATABASE_URL is not set')
const rpcUrl = env('RPC_URL') ?? 'https://api.mainnet-beta.solana.com'
const extraOrigins = (env('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const db = createPool(databaseUrl)
await migrate(db)

const app = createApp({
  db,
  fetchTx: rpcFetchTx(rpcUrl),
  pinataJwt: env('PINATA_JWT'),
  allowedOrigins: [...DEFAULT_ORIGINS, ...extraOrigins],
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

setInterval(() => purgeExpired(db).catch((e) => console.error('purge failed', e)), 60_000).unref()

const port = Number(env('PORT') ?? 8080)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`condom-registry listening on :${port} (rpc ${new URL(rpcUrl).host}, pinata ${env('PINATA_JWT') ? 'on' : 'off'})`)
})
