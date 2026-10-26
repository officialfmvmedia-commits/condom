/**
 * CONDOM protocol rules. Single source of truth for every number the UI shows.
 * These are enforced by the launch transaction CONDOM builds (see launchTxBuilder.ts),
 * and checked after the fact by the Launch Report analyzer (/analyzer).
 */
export const RULES = {
  /** Hard cap on the creator's buy inside the create transaction. */
  MAX_DEV_BUY_SOL: 0.3,
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
