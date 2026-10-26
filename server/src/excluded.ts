import type { Db } from './db'

/** EXCLUDED_MINTS env (comma list) -> Set. */
export function parseExcluded(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))
}

/**
 * Removes excluded coins everywhere: ticker rows (frees the ticker), trades, trade cursors.
 * Remembers them in excluded_mints so the genesis watcher never re-registers them, and
 * recounts each genesis wallet's registered coins (excluded ones no longer count).
 */
export async function purgeExcluded(db: Db, excluded: Set<string>): Promise<{ tickers: number; trades: number }> {
  if (!excluded.size) return { tickers: 0, trades: 0 }
  const mints = [...excluded]
  const client = await db.connect()
  try {
    await client.query('begin')
    await client.query(`insert into excluded_mints (mint) select unnest($1::text[]) on conflict do nothing`, [mints])
    const t = await client.query(`delete from tickers where mint = any($1::text[])`, [mints])
    const tr = await client.query(`delete from trades where mint = any($1::text[])`, [mints])
    await client.query(`delete from trade_cursor where mint = any($1::text[])`, [mints])
    await client.query(`update genesis_watch g set registered = (
        select count(*) from tickers t where t.genesis and t.creator = g.creator), updated_at = now()`)
    await client.query('commit')
    return { tickers: t.rowCount ?? 0, trades: tr.rowCount ?? 0 }
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
