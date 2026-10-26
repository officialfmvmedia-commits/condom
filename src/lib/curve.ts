/**
 * pump.fun-style constant-product bonding curve math (initial state).
 * Public constants of the pump.fun curve at token creation:
 *   virtual SOL reserves   = 30 SOL
 *   virtual token reserves = 1,073,000,000 tokens
 *   real token reserves    = 793,100,000 tokens (sold on the curve before graduation)
 *   total supply           = 1,000,000,000 tokens
 * Fees are ignored here, so readouts are labelled "before fees".
 */
export const CURVE = {
  VIRTUAL_SOL: 30,
  VIRTUAL_TOKENS: 1_073_000_000,
  REAL_TOKENS: 793_100_000,
  TOTAL_SUPPLY: 1_000_000_000,
} as const

/** Tokens received for `sol` spent as the very first buy on a fresh curve. */
export function tokensForFirstBuy(sol: number): number {
  if (sol <= 0) return 0
  const k = CURVE.VIRTUAL_SOL * CURVE.VIRTUAL_TOKENS
  return CURVE.VIRTUAL_TOKENS - k / (CURVE.VIRTUAL_SOL + sol)
}

/** Percent (0-100) of total supply bought by a first buy of `sol`. */
export function supplyPctForFirstBuy(sol: number): number {
  return (tokensForFirstBuy(sol) / CURVE.TOTAL_SUPPLY) * 100
}
