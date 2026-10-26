import { serve } from '@hono/node-server'
import { createApp, DEFAULT_ORIGINS } from './app'
import { createPool, migrate, purgeExpired } from './db'
import { rpcFetchTx } from './verify'

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

setInterval(() => purgeExpired(db).catch((e) => console.error('purge failed', e)), 60_000).unref()

const port = Number(env('PORT') ?? 8080)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`condom-registry listening on :${port} (rpc ${new URL(rpcUrl).host}, pinata ${env('PINATA_JWT') ? 'on' : 'off'})`)
})
