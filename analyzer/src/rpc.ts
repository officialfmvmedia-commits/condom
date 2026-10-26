/** Minimal read-only Solana JSON-RPC client with pacing + 429 backoff. No keys, no sends. */

export interface RpcOptions {
  url: string
  /** Minimum ms between requests (public mainnet RPC allows roughly 10 req/s per method). */
  minIntervalMs?: number
  maxRetries?: number
  log?: (msg: string) => void
}

const READ_ONLY = new Set([
  'getSignaturesForAddress', 'getTransaction', 'getTokenSupply', 'getAccountInfo',
  'getMinimumBalanceForRentExemption', 'getSlot', 'getBlockTime',
])

export class Rpc {
  private last = 0
  private queue: Promise<unknown> = Promise.resolve()
  private id = 0
  calls = 0
  constructor(private opts: RpcOptions) {}

  call<T>(method: string, params: unknown[]): Promise<T> {
    if (!READ_ONLY.has(method)) throw new Error(`Rpc: ${method} is not on the read-only allowlist`)
    const run = async (): Promise<T> => {
      const max = this.opts.maxRetries ?? 10
      for (let attempt = 0; ; attempt++) {
        const wait = this.last + (this.opts.minIntervalMs ?? 140) - Date.now()
        if (wait > 0) await sleep(wait)
        this.last = Date.now()
        this.calls++
        let status = 0
        try {
          const res = await fetch(this.opts.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
          })
          status = res.status
          const body = (await res.json().catch(() => null)) as { result?: T; error?: { code: number; message: string } } | null
          if (body && !body.error && res.ok) return body.result as T
          const code = body?.error?.code ?? status
          const retryable = code === 429 || status === 429 || status >= 500 || code === -32005 || code === -32004
          if (!retryable || attempt >= max) throw new Error(`${method}: ${body?.error?.message ?? `HTTP ${status}`}`)
        } catch (e) {
          if (attempt >= max) throw e
          if (e instanceof Error && e.message.startsWith(`${method}:`)) throw e
        }
        const backoff = Math.min(15_000, 600 * 2 ** attempt) + Math.random() * 300
        this.opts.log?.(`rpc ${method} retry ${attempt + 1} in ${Math.round(backoff)}ms${status ? ` (HTTP ${status})` : ''}`)
        await sleep(backoff)
      }
    }
    const p = this.queue.then(run, run)
    this.queue = p.catch(() => undefined)
    return p
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ---- RPC response shapes (subset) ---- */
export interface SigInfo { signature: string; slot: number; err: unknown; blockTime: number | null }
export interface TokenBal { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string; decimals: number; uiAmount: number | null } }
export interface RawTx {
  slot: number
  blockTime: number | null
  version?: number | 'legacy'
  transaction: { signatures: string[]; message: { accountKeys: string[]; header: { numRequiredSignatures: number } } }
  meta: {
    err: unknown
    fee: number
    preBalances: number[]
    postBalances: number[]
    preTokenBalances?: TokenBal[]
    postTokenBalances?: TokenBal[]
    logMessages?: string[]
    loadedAddresses?: { writable: string[]; readonly: string[] }
  } | null
}

/** Full account key list including address-table-loaded keys, in index order. */
export function accountKeys(tx: RawTx): string[] {
  const keys = [...tx.transaction.message.accountKeys]
  const la = tx.meta?.loadedAddresses
  if (la) keys.push(...la.writable, ...la.readonly)
  return keys
}
