/**
 * Launch Report schema. Shared by the frontend and the Node analyzer (/analyzer).
 * Pure types, no runtime imports, so both environments can use it.
 */

export type Grade = 'PROTECTED' | 'CAUTION' | 'UNPROTECTED'
export type CheckStatus = 'pass' | 'warn' | 'fail'
export type CheckId = 'dev-block0' | 'dev-cap' | 'create-bundle' | 'dev-funded' | 'block0' | 'jito-bundle'

export interface ReportCheck {
  id: CheckId
  label: string
  status: CheckStatus
  detail: string
}

export interface EarlyBuy {
  signature: string
  slot: number
  /** 0 = same slot as the create transaction ("block 0"). */
  slotOffset: number
  buyer: string
  sol: number
  tokens: number
  pctOfSupply: number
  isDev: boolean
  /** Bought inside the create transaction itself. */
  inCreateTx: boolean
  block0: boolean
  /** The buyer received SOL directly from the dev wallet before buying (1 hop). */
  fundedByDev: boolean
  fundingSignatures: string[]
  /** Where the buy happened: pump.fun bonding curve, PumpSwap AMM (after graduation), or other routing. */
  venue: 'curve' | 'amm' | 'other'
  /** Transaction paid a Jito tip (bundle / priority lane). */
  jitoTip: boolean
}

export interface LaunchReport {
  version: 1
  mint: string
  generatedAt: string
  network: 'mainnet-beta' | 'devnet'
  program: string
  totalSupply: number
  creation: {
    signature: string
    slot: number
    blockTime: number | null
    creator: string
    jitoTip: boolean
  }
  window: { fromSlot: number; toSlot: number; slotsAfterCreation: number }
  dev: {
    wallet: string
    buySol: number
    buyTokens: number
    buyPctOfSupply: number
    /** The dev bought in the creation slot (incl. inside the create tx). Never allowed on CONDOM. */
    block0Buy: boolean
    /** Slots between creation and the dev's first buy in the window; null if no dev buy in the window. */
    firstBuySlotOffset: number | null
  }
  earlyBuys: EarlyBuy[]
  summary: {
    block0Buyers: number
    block0OutsiderPctOfSupply: number
    earlyBuyers: number
    earlyOutsiderPctOfSupply: number
    devFundedWallets: number
    devFundedPctOfSupply: number
    createTxExtraBuyers: number
  }
  checks: ReportCheck[]
  grade: Grade
  notes: string[]
}
