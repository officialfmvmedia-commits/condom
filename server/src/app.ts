import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import {
  confirmTicker, getByMint, getTicker, listLive, MintAlreadyRegistered, reserveTicker,
  type Db, type TickerRow,
} from './db'
import { displayTicker, normalizeTicker, TickerError } from './normalize'
import { isPubkey, verifyCreateTx, verifyReserveSignature, VerifyError, type FetchTx } from './verify'
import { pinataUploadMetadata, UploadError } from './ipfs'

export const RESERVATION_MINUTES = 10

export const DEFAULT_ORIGINS = [
  'https://thecondom.fun',
  'https://www.thecondom.fun',
]

export interface AppDeps {
  db: Db
  fetchTx: FetchTx
  /** Fetches metadata JSON for an on-chain uri; used to cache the image url. */
  fetchMetadata?: (uri: string) => Promise<{ image?: string; description?: string } | null>
  pinataJwt?: string
  allowedOrigins?: string[]
  /** requests per minute per IP for general endpoints */
  rateLimitPerMinute?: number
}

// ----------------------------------------------------------------- rate limit

function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>()
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
  }, windowMs).unref?.()
  return async (c: Context, next: () => Promise<void>) => {
    const ip = (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || c.req.header('x-real-ip') || 'local'
    const now = Date.now()
    let h = hits.get(ip)
    if (!h || h.reset < now) hits.set(ip, (h = { n: 0, reset: now + windowMs }))
    h.n++
    if (h.n > limit) {
      c.header('Retry-After', String(Math.ceil((h.reset - now) / 1000)))
      return c.json({ error: 'Too many requests. Slow down.' }, 429)
    }
    await next()
  }
}

// ----------------------------------------------------------------- helpers

const isLocalOrigin = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)

function isActive(row: TickerRow, now = Date.now()) {
  return row.status === 'live' || (row.reserved_until != null && row.reserved_until.getTime() > now)
}

export function coinJson(r: TickerRow) {
  return {
    mint: r.mint,
    name: r.name ?? r.ticker_display,
    symbol: r.ticker_display,
    imageUrl: r.image,
    creator: r.creator,
    createdAt: (r.live_at ?? r.created_at).getTime(),
    curveProgress: 0,
    signature: r.signature,
  }
}

function tickerJson(input: string, r: TickerRow | null, viewer?: string) {
  const norm = normalizeTicker(input)
  const base = { ticker: displayTicker(input), normalized: norm }
  if (!r || !isActive(r)) return { ...base, available: true as const, status: 'available' as const }
  if (r.status === 'live') {
    return { ...base, available: false as const, status: 'live' as const, coin: coinJson(r) }
  }
  const mine = !!viewer && viewer === r.creator
  return {
    ...base,
    available: mine,
    status: 'reserved' as const,
    reservedByYou: mine,
    reservedUntil: r.reserved_until?.toISOString(),
  }
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const j = await c.req.json()
    if (j && typeof j === 'object') return j as Record<string, unknown>
  } catch {}
  throw new HttpError(400, 'Body must be JSON.')
}

class HttpError extends Error {
  constructor(public status: 400 | 404 | 409 | 422 | 503, message: string) {
    super(message)
  }
}

const str = (v: unknown, field: string, max = 200): string => {
  if (typeof v !== 'string' || !v || v.length > max) throw new HttpError(400, `Missing or invalid "${field}".`)
  return v
}

async function defaultFetchMetadata(uri: string) {
  if (!/^https:\/\//.test(uri)) return null
  const ctl = AbortSignal.timeout(5000)
  const res = await fetch(uri, { signal: ctl, headers: { accept: 'application/json' } })
  if (!res.ok) return null
  const j = (await res.json()) as Record<string, unknown>
  return {
    image: typeof j.image === 'string' ? j.image : undefined,
    description: typeof j.description === 'string' ? j.description : undefined,
  }
}

// ----------------------------------------------------------------- app

export function createApp(deps: AppDeps) {
  const app = new Hono()
  const origins = deps.allowedOrigins ?? DEFAULT_ORIGINS
  const fetchMetadata = deps.fetchMetadata ?? defaultFetchMetadata

  app.use(
    '*',
    cors({
      origin: (o) => (origins.includes(o) || isLocalOrigin(o) ? o : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['content-type'],
      maxAge: 600,
    }),
  )
  app.use('*', rateLimiter(deps.rateLimitPerMinute ?? 120, 60_000))
  app.use('/tickers/reserve', rateLimiter(20, 60_000))
  app.use('/tickers/confirm', rateLimiter(20, 60_000))
  app.use('/ipfs', rateLimiter(10, 10 * 60_000))

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
    if (err instanceof TickerError || err instanceof VerifyError) return c.json({ error: err.message }, 422)
    if (err instanceof UploadError) return c.json({ error: err.message }, 502)
    if (err instanceof MintAlreadyRegistered) return c.json({ error: err.message }, 409)
    console.error(err)
    return c.json({ error: 'Server error. Try again.' }, 500)
  })

  app.get('/', (c) => c.json({ ok: true, service: 'condom-registry' }))
  app.get('/health', async (c) => {
    await deps.db.query('select 1')
    return c.json({ ok: true })
  })

  // Live availability check for the Launch form.
  app.get('/tickers/:t', async (c) => {
    const input = decodeURIComponent(c.req.param('t'))
    const norm = normalizeTicker(input)
    const viewer = c.req.query('creator')
    return c.json(tickerJson(input, await getTicker(deps.db, norm), viewer))
  })

  // Hold a ticker for ~10 minutes while the create tx is signed.
  app.post('/tickers/reserve', async (c) => {
    const b = await readJson(c)
    const input = str(b.ticker, 'ticker', 64)
    const creator = str(b.creator, 'creator', 64)
    const message = str(b.message, 'message', 400)
    const signature = str(b.signature, 'signature', 200)
    const norm = normalizeTicker(input)
    const display = displayTicker(input)
    verifyReserveSignature({ display, creator, message, signature })
    const row = await reserveTicker(deps.db, { norm, display, creator, minutes: RESERVATION_MINUTES })
    if (!row) {
      const existing = await getTicker(deps.db, norm)
      return c.json({ error: existing?.status === 'live' ? 'Ticker is taken.' : 'Ticker is reserved by another wallet.', ...tickerJson(input, existing, creator) }, 409)
    }
    return c.json({ ok: true, ticker: row.ticker_display, normalized: row.ticker_norm, reservedUntil: row.reserved_until?.toISOString() })
  })

  // Bind a confirmed on-chain create to the ticker and mark it live.
  app.post('/tickers/confirm', async (c) => {
    const b = await readJson(c)
    const input = str(b.ticker, 'ticker', 64)
    const mint = str(b.mint, 'mint', 64)
    const signature = str(b.signature, 'signature', 120)
    if (!isPubkey(mint)) throw new HttpError(400, 'Invalid mint.')
    const norm = normalizeTicker(input)
    const existing = await getTicker(deps.db, norm)
    if (existing?.status === 'live') {
      if (existing.mint === mint) return c.json({ ok: true, coin: coinJson(existing) })
      return c.json({ error: 'Ticker is taken.', ...tickerJson(input, existing) }, 409)
    }
    // Only coins launched through CONDOM (reserve -> create -> confirm) can claim a ticker.
    if (!existing) throw new HttpError(409, 'Reserve the ticker before launching.')
    const creator = existing.creator
    if (typeof b.creator === 'string' && b.creator !== creator) {
      return c.json({ error: 'Ticker is reserved by another wallet.', ...tickerJson(input, existing) }, 409)
    }
    const info = await verifyCreateTx(deps.fetchTx, { signature, mint, creator })
    if (info.blockTime != null && info.blockTime * 1000 < existing.created_at.getTime() - 120_000) {
      throw new HttpError(422, 'This create happened before the ticker was reserved.')
    }
    if (normalizeTicker(info.symbol) !== norm) throw new HttpError(422, `On-chain symbol "${info.symbol}" does not match ticker.`)
    let image: string | null = null
    try {
      image = (await fetchMetadata(info.uri))?.image ?? null
    } catch {}
    const row = await confirmTicker(deps.db, {
      norm, display: displayTicker(info.symbol), creator, mint, signature, name: info.name, uri: info.uri, image,
    })
    if (!row) {
      const now = await getTicker(deps.db, norm)
      return c.json({ error: 'Ticker is held by another wallet.', ...tickerJson(input, now) }, 409)
    }
    return c.json({ ok: true, coin: coinJson(row) })
  })

  // Live CONDOM coins for the home grid.
  app.get('/coins', async (c) => {
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 60))
    const rows = await listLive(deps.db, limit)
    c.header('Cache-Control', 'public, max-age=10')
    return c.json({ items: rows.map(coinJson) })
  })

  app.get('/coins/:mint', async (c) => {
    const row = await getByMint(deps.db, c.req.param('mint'))
    if (!row) return c.json({ error: 'Not a CONDOM coin.' }, 404)
    return c.json(coinJson(row))
  })

  // Metadata upload (image + JSON) to IPFS through Pinata. Keeps the JWT server-side.
  app.post('/ipfs', bodyLimit({ maxSize: 5 * 1024 * 1024 + 64 * 1024, onError: (c) => c.json({ error: 'Image too large (max 5 MB).' }, 413) }), async (c) => {
    if (!deps.pinataJwt) throw new HttpError(503, 'Metadata upload is not configured (PINATA_JWT).')
    const form = await c.req.formData().catch(() => {
      throw new HttpError(400, 'Body must be multipart/form-data.')
    })
    const file = form.get('file')
    if (!(file instanceof File) || !file.size) throw new HttpError(400, 'Image is required.')
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) throw new HttpError(400, 'Image must be PNG, JPG, GIF or WEBP.')
    const field = (k: string, max: number) => {
      const v = form.get(k)
      return typeof v === 'string' ? v.trim().slice(0, max) : ''
    }
    const name = field('name', 32)
    const symbol = displayTicker(field('symbol', 32))
    if (!name || !symbol) throw new HttpError(400, 'Name and ticker are required.')
    normalizeTicker(symbol)
    const out = await pinataUploadMetadata(deps.pinataJwt, {
      file,
      name,
      symbol,
      description: field('description', 1000),
      twitter: field('twitter', 200),
      telegram: field('telegram', 200),
      website: field('website', 200),
    })
    return c.json(out)
  })

  return app
}
