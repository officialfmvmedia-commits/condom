/**
 * Tiny read-only report service for the frontend.
 *   GET /report/:mint  -> LaunchReport JSON (cached on disk)
 * Run: npm run report:serve  (PORT=8787, SOLANA_RPC optional)
 * Frontend: VITE_CONDOM_REPORT_API=http://localhost:8787 npm run dev
 */
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeMint } from './analyze'

const PORT = Number(process.env.PORT ?? 8787)
const CACHE = join(process.cwd(), '.cache', 'reports')
mkdirSync(CACHE, { recursive: true })
const inflight = new Map<string, Promise<string>>()
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  const m = req.url?.match(/^\/report\/([^/?#]+)/)
  if (req.method !== 'GET' || !m) { res.writeHead(404).end(); return }
  const mint = decodeURIComponent(m[1])
  if (!BASE58.test(mint)) { res.writeHead(400).end('bad mint'); return }
  const file = join(CACHE, `${mint}.json`)
  try {
    let body: string
    if (existsSync(file)) body = readFileSync(file, 'utf8')
    else {
      if (!inflight.has(mint)) inflight.set(mint, analyzeMint(mint, { log: (l) => console.log(`[${mint.slice(0, 6)}] ${l}`) }).then((r) => {
        const s = JSON.stringify(r); writeFileSync(file, s); return s
      }).finally(() => inflight.delete(mint)))
      body = await inflight.get(mint)!
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(body)
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
}).listen(PORT, () => console.log(`CONDOM report service on http://localhost:${PORT}/report/<mint>`))
