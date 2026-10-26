/**
 * Ticker normalization for the NO VAMPS registry.
 *
 * Two tickers that a human would read as "the same coin" must normalize to the
 * same key, so `$PEPE`, `pepe`, `PΕPΕ` (Greek Epsilon), `PEPE\u200B` and
 * `ＰＥＰＥ` (full-width) all collide.
 */

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u00AD\u034F\u180E]/g
const COMBINING = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g

/** Uppercase-only fold table, applied after NFKC + toUpperCase(). */
const CONFUSABLES: Record<string, string> = {
  // digit / letter lookalikes
  '0': 'O',
  '1': 'I',
  L: 'I',
  '|': 'I',
  '!': 'I',
  // Cyrillic capitals
  'А': 'A', 'В': 'B', 'Е': 'E', 'Ё': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',
  'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X', 'І': 'I', 'Ї': 'I', 'Ј': 'J',
  'Ѕ': 'S', 'Ԁ': 'D', 'Ԛ': 'Q', 'Ԝ': 'W', 'Ү': 'Y', 'Һ': 'H', 'Ӏ': 'I', 'Ꞵ': 'B',
  // Greek capitals
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M',
  'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'Ϲ': 'C', 'Ϳ': 'J',
  // misc
  'Ⅰ': 'I', 'Ɩ': 'I', 'ǀ': 'I',
}

export const MAX_TICKER_LENGTH = 10

export class TickerError extends Error {}

/** Display form: what the creator typed, trimmed, NFKC'd, `$` stripped, uppercased. */
export function displayTicker(input: string): string {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .trim()
    .replace(/^\$+/, '')
    .trim()
    .toUpperCase()
}

/** Registry key. Throws TickerError for empty / too long / invalid input. */
export function normalizeTicker(input: string): string {
  const display = displayTicker(input)
  let s = display.normalize('NFKD').replace(COMBINING, '').normalize('NFKC')
  s = s.replace(ZERO_WIDTH, '').replace(/\s+/g, '').toUpperCase()
  let out = ''
  for (const ch of s) out += CONFUSABLES[ch] ?? ch
  if (!out) throw new TickerError('Ticker is empty.')
  if ([...display].length > MAX_TICKER_LENGTH) throw new TickerError(`Ticker is longer than ${MAX_TICKER_LENGTH} characters.`)
  if (!/^[\p{L}\p{N}_.\-]+$/u.test(out)) throw new TickerError('Ticker can only use letters and numbers.')
  return out
}
