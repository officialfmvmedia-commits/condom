/**
 * Decoder for pump.fun's TradeEvent (Anchor event emitted as "Program data: <base64>").
 * Layout (little-endian): disc[8] mint[32] sol_amount u64 token_amount u64 is_buy u8 user[32] timestamp i64 ...
 * Verified against mainnet CreateV2 + BuyV3 transactions (Oct 2026).
 */
const TRADE_EVENT_DISC = 'bddb7fd34ee661ee'

export interface TradeEvent {
  mint: string
  solLamports: bigint
  tokenAmount: bigint
  isBuy: boolean
  user: string
}

export function parseTradeEvents(logs: string[], mint?: string): TradeEvent[] {
  const out: TradeEvent[] = []
  for (const l of logs) {
    if (!l.startsWith('Program data: ')) continue
    const b = Buffer.from(l.slice(14), 'base64')
    if (b.length < 8 + 32 + 8 + 8 + 1 + 32 || b.subarray(0, 8).toString('hex') !== TRADE_EVENT_DISC) continue
    let o = 8
    const ev: TradeEvent = {
      mint: b58(b.subarray(o, (o += 32))),
      solLamports: b.readBigUInt64LE(o),
      tokenAmount: b.readBigUInt64LE(o + 8),
      isBuy: b[o + 16] === 1,
      user: b58(b.subarray(o + 17, o + 49)),
    }
    if (!mint || ev.mint === mint) out.push(ev)
  }
  return out
}

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export function b58(bytes: Uint8Array): string {
  let n = 0n
  for (const x of bytes) n = n * 256n + BigInt(x)
  let s = ''
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n }
  for (const x of bytes) { if (x === 0) s = '1' + s; else break }
  return s
}
