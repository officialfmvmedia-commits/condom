/** Base58 mint address. */
export type Mint = string

export interface TokenSummary {
  mint: Mint
  name: string
  symbol: string
  imageUrl: string | null
  description?: string
  creator: string
  createdAt: number
  /** Market cap in SOL, if known. */
  marketCapSol?: number
  /** Bonding curve progress, 0..1 (1 = graduated). */
  curveProgress: number
  devBuyPct?: number
}

export interface TokenSocials {
  x?: string
  telegram?: string
  website?: string
}

export interface LaunchParams {
  name: string
  symbol: string
  description: string
  image: File | null
  socials: TokenSocials
  /**
   * Planned dev buy in SOL (0 = none). NOT part of the create transaction: it is sent separately via
   * devBuy() once the creation slot has passed. Must be <= RULES.MAX_DEV_BUY_SOL.
   */
  devBuySol: number
}

export interface LaunchResult {
  mint: Mint
  signature: string
  /** Slot the create transaction landed in ("block 0"). The dev buy unlocks after it. */
  slot: number
  /** Set when the coin is live on-chain but the ticker registry could not be updated. */
  registryWarning?: string
}

export interface DevBuyParams {
  mint: Mint
  sol: number
  /** Creation slot returned by launch(); the backend re-checks the slot gap before building. */
  creationSlot: number
  slippageBps: number
}

export interface TradeParams {
  mint: Mint
  /** Buy: SOL in. Sell: tokens in. */
  amount: number
  slippageBps: number
}

export interface TradeResult {
  signature: string
}

export interface Trade {
  signature: string
  mint: Mint
  side: 'buy' | 'sell'
  trader: string
  sol: number
  tokens: number
  timestamp: number
  slot: number
}

export interface Holder {
  owner: string
  amount: number
  pct: number
  tag?: 'dev' | 'curve' | 'block0' | 'dev-funded'
}

export type TokenSort = 'new' | 'rising' | 'graduating'

export interface ListTokensQuery {
  sort: TokenSort
  search?: string
  limit?: number
  cursor?: string
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
}

/** Minimal signer the backend needs. Satisfied by @solana/wallet-adapter-react's useWallet(). */
export interface WalletSigner {
  publicKey: { toBase58(): string }
  signTransaction<T>(tx: T): Promise<T>
  /** Used once per launch to prove wallet ownership when reserving the ticker. */
  signMessage?(message: Uint8Array): Promise<Uint8Array>
}

/** Progress callback for multi-step writes (shown under the Launch button). */
export type StepFn = (step: string) => void

export type BackendStatus = 'live' | 'not-connected'

/**
 * Everything the UI needs from a launchpad backend.
 * Implementations: a pump.fun wrapper (planned), a custom on-chain program, or a dev-only mock.
 */
export interface LaunchpadBackend {
  readonly id: string
  readonly status: BackendStatus
  /** Creates the coin. The create transaction contains no buy. */
  launch(params: LaunchParams, signer: WalletSigner, onStep?: StepFn): Promise<LaunchResult>
  /** The dev's one capped buy. Rejected unless current slot >= creationSlot + RULES.DEV_BUY_MIN_SLOTS_AFTER_CREATE. */
  devBuy(params: DevBuyParams, signer: WalletSigner, onStep?: StepFn): Promise<TradeResult>
  buy(params: TradeParams, signer: WalletSigner): Promise<TradeResult>
  sell(params: TradeParams, signer: WalletSigner): Promise<TradeResult>
  listTokens(query: ListTokensQuery): Promise<Page<TokenSummary>>
  getToken(mint: Mint): Promise<TokenSummary | null>
  getTrades(mint: Mint, limit?: number): Promise<Trade[]>
  getHolders(mint: Mint, limit?: number): Promise<Holder[]>
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not available yet: no launchpad backend is connected.`)
    this.name = 'NotImplementedError'
  }
}
