import pg from 'pg'

export const SCHEMA_SQL = `
create table if not exists tickers (
  ticker_norm    text primary key,
  ticker_display text not null,
  mint           text unique,
  creator        text not null,
  status         text not null check (status in ('reserved', 'live')),
  reserved_until timestamptz,
  created_at     timestamptz not null default now(),
  name           text,
  uri            text,
  image          text,
  signature      text unique,
  live_at        timestamptz
);
create index if not exists tickers_live_idx on tickers (live_at desc) where status = 'live';
`

export interface TickerRow {
  ticker_norm: string
  ticker_display: string
  mint: string | null
  creator: string
  status: 'reserved' | 'live'
  reserved_until: Date | null
  created_at: Date
  name: string | null
  uri: string | null
  image: string | null
  signature: string | null
  live_at: Date | null
}

export type Db = pg.Pool

export function createPool(connectionString: string): pg.Pool {
  // Render internal URLs (host "dpg-…-a") are plain; external URLs (*.render.com) need TLS.
  const host = new URL(connectionString).hostname
  const wantSsl = process.env.PGSSL === 'on' || (process.env.PGSSL !== 'off' && (/\.render\.com$/.test(host) || /sslmode=require/.test(connectionString)))
  return new pg.Pool({ connectionString, max: 10, ssl: wantSsl ? { rejectUnauthorized: false } : undefined })
}

export async function migrate(db: Db): Promise<void> {
  await db.query(SCHEMA_SQL)
}

export async function getTicker(db: Db, norm: string): Promise<TickerRow | null> {
  const { rows } = await db.query<TickerRow>('select * from tickers where ticker_norm = $1', [norm])
  return rows[0] ?? null
}

/**
 * Atomically reserve a ticker. Succeeds when the ticker is unused, its previous
 * reservation expired, or the same creator re-reserves it. Returns null when it
 * is live or reserved by someone else. The primary key on ticker_norm is what
 * makes concurrent attempts safe: exactly one insert/update wins.
 */
export async function reserveTicker(
  db: Db,
  args: { norm: string; display: string; creator: string; minutes: number },
): Promise<TickerRow | null> {
  const { rows } = await db.query<TickerRow>(
    `insert into tickers (ticker_norm, ticker_display, creator, status, reserved_until)
     values ($1, $2, $3, 'reserved', now() + make_interval(mins => $4))
     on conflict (ticker_norm) do update
       set ticker_display = excluded.ticker_display,
           creator        = excluded.creator,
           reserved_until = excluded.reserved_until,
           created_at     = now()
       where tickers.status = 'reserved'
         and (tickers.reserved_until < now() or tickers.creator = excluded.creator)
     returning *`,
    [args.norm, args.display, args.creator, args.minutes],
  )
  return rows[0] ?? null
}

export class MintAlreadyRegistered extends Error {}

/**
 * Bind a verified on-chain create to a ticker and mark it live. Works with or
 * without a prior reservation, but never steals a ticker that is live or held
 * by another creator. Idempotent for the same mint.
 */
export async function confirmTicker(
  db: Db,
  args: { norm: string; display: string; creator: string; mint: string; signature: string; name: string; uri: string; image: string | null },
): Promise<TickerRow | null> {
  try {
    const { rows } = await db.query<TickerRow>(
      `insert into tickers (ticker_norm, ticker_display, creator, status, mint, signature, name, uri, image, live_at)
       values ($1, $2, $3, 'live', $4, $5, $6, $7, $8, now())
       on conflict (ticker_norm) do update
         set status = 'live', mint = excluded.mint, signature = excluded.signature,
             name = excluded.name, uri = excluded.uri, image = excluded.image,
             reserved_until = null, live_at = now()
         where tickers.status = 'reserved'
           and (tickers.creator = excluded.creator or tickers.reserved_until < now())
       returning *`,
      [args.norm, args.display, args.creator, args.mint, args.signature, args.name, args.uri, args.image],
    )
    if (rows[0]) return rows[0]
  } catch (e: any) {
    if (e?.code === '23505') {
      // unique mint/signature: already bound (possibly to this very ticker)
      const existing = await getTicker(db, args.norm)
      if (existing?.mint === args.mint) return existing
      throw new MintAlreadyRegistered('This mint is already registered to another ticker.')
    }
    throw e
  }
  const existing = await getTicker(db, args.norm)
  if (existing?.status === 'live' && existing.mint === args.mint) return existing
  return null
}

export async function listLive(db: Db, limit = 60): Promise<TickerRow[]> {
  const { rows } = await db.query<TickerRow>(
    `select * from tickers where status = 'live' order by live_at desc limit $1`,
    [limit],
  )
  return rows
}

export async function getByMint(db: Db, mint: string): Promise<TickerRow | null> {
  const { rows } = await db.query<TickerRow>(`select * from tickers where mint = $1 and status = 'live'`, [mint])
  return rows[0] ?? null
}

export async function purgeExpired(db: Db): Promise<number> {
  const r = await db.query(`delete from tickers where status = 'reserved' and reserved_until < now()`)
  return r.rowCount ?? 0
}
