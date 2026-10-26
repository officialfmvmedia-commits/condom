/**
 * CONDOM protocol rules. Single source of truth for every number the UI shows.
 * These are enforced by the transactions CONDOM builds (see launchTxBuilder.ts),
 * and checked after the fact by the Launch Report analyzer (/analyzer).
 */
export const RULES = {
  /** Hard cap on the creator's (single, optional) buy. */
  MAX_DEV_BUY_SOL: 0.3,
  /**
   * The create transaction contains NO buy. The dev buy unlocks only once the chain is at least
   * this many slots past the creation slot (creation slot = "block 0").
   */
  DEV_BUY_MIN_SLOTS_AFTER_CREATE: 2,
  /** Approximate Solana slot time, for countdown display only. */
  APPROX_SLOT_MS: 400,
  /** Slider step for the dev buy. */
  DEV_BUY_STEP_SOL: 0.01,
  /** Slots after creation (inclusive window = creation slot + N) the Launch Report inspects. */
  REPORT_WINDOW_SLOTS: 2,
  /** Block-0 outsider share (of total supply) above which a launch is graded CAUTION instead of PROTECTED. */
  BLOCK0_CAUTION_PCT: 5,
} as const

export const LIMITS = {
  NAME_MAX: 32,
  TICKER_MAX: 10,
  DESCRIPTION_MAX: 280,
  IMAGE_MAX_BYTES: 4 * 1024 * 1024,
} as const
