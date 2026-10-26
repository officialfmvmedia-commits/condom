import { ed25519 } from '@noble/curves/ed25519.js'
import bs58 from 'bs58'

export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const CREATE_V2_DISC = [214, 144, 76, 236, 95, 139, 49, 180]
const CREATE_V1_DISC = [24, 30, 200, 40, 5, 28, 7, 119]
/** create_v2 accounts: mint = 0, user = 5. create (v1): mint = 0, user = 7. */
const ACCOUNT_INDEX = { v2: { mint: 0, user: 5 }, v1: { mint: 0, user: 7 } }

export const MESSAGE_MAX_AGE_MS = 5 * 60_000

export class VerifyError extends Error {}

export function isPubkey(s: unknown): s is string {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false
  try {
    return bs58.decode(s).length === 32
  } catch {
    return false
  }
}

/** The exact text the wallet signs to reserve a ticker. Frontend builds the same string. */
export function reserveMessage(display: string, creator: string, issuedAt: string): string {
  return `CONDOM: reserve $${display} for ${creator}\nissued: ${issuedAt}`
}

function decodeSig(sig: string): Uint8Array {
  try {
    const b = bs58.decode(sig)
    if (b.length === 64) return b
  } catch {}
  const b = Buffer.from(sig, 'base64')
  if (b.length === 64) return new Uint8Array(b)
  throw new VerifyError('Signature is not a 64-byte ed25519 signature.')
}

/** Verifies a signMessage() signature over the reserve message. Returns nothing or throws. */
export function verifyReserveSignature(args: {
  display: string
  creator: string
  message: string
  signature: string
  now?: number
}): void {
  if (!isPubkey(args.creator)) throw new VerifyError('Creator is not a valid wallet address.')
  const m = /^CONDOM: reserve \$(.+) for (\S+)\nissued: (\S+)$/.exec(args.message ?? '')
  if (!m) throw new VerifyError('Message format is wrong.')
  if (m[1] !== args.display || m[2] !== args.creator) throw new VerifyError('Message does not match this ticker and wallet.')
  const issued = Date.parse(m[3])
  const now = args.now ?? Date.now()
  if (!Number.isFinite(issued) || issued > now + 60_000 || now - issued > MESSAGE_MAX_AGE_MS) {
    throw new VerifyError('Signed message expired. Sign again.')
  }
  const ok = ed25519.verify(decodeSig(args.signature), new TextEncoder().encode(args.message), bs58.decode(args.creator))
  if (!ok) throw new VerifyError('Wallet signature is invalid.')
}

// ---------------------------------------------------------------- tx check

export interface CreateInfo {
  mint: string
  creator: string
  name: string
  symbol: string
  uri: string
  slot: number
  blockTime: number | null
  signature: string
}

function readString(buf: Uint8Array, off: number): [string, number] {
  if (off + 4 > buf.length) throw new VerifyError('Create instruction data is truncated.')
  const len = buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)
  if (len < 0 || off + 4 + len > buf.length) throw new VerifyError('Create instruction data is truncated.')
  return [new TextDecoder().decode(buf.subarray(off + 4, off + 4 + len)), off + 4 + len]
}

/** Decode name/symbol/uri/creator from pump.fun create or create_v2 instruction data. */
export function decodeCreateData(data: Uint8Array): { version: 'v1' | 'v2'; name: string; symbol: string; uri: string; creator: string | null } {
  const disc = Array.from(data.subarray(0, 8))
  const version = disc.every((b, i) => b === CREATE_V2_DISC[i]) ? 'v2' : disc.every((b, i) => b === CREATE_V1_DISC[i]) ? 'v1' : null
  if (!version) throw new VerifyError('Not a pump.fun create instruction.')
  let off = 8
  let name: string, symbol: string, uri: string
  ;[name, off] = readString(data, off)
  ;[symbol, off] = readString(data, off)
  ;[uri, off] = readString(data, off)
  const creator = off + 32 <= data.length ? bs58.encode(data.subarray(off, off + 32)) : null
  return { version, name, symbol, uri, creator }
}

type RpcTx = {
  slot: number
  blockTime?: number | null
  meta: { err: unknown; loadedAddresses?: { writable: string[]; readonly: string[] } } | null
  transaction: {
    signatures: string[]
    message: {
      accountKeys: string[]
      header: { numRequiredSignatures: number }
      instructions: { programIdIndex: number; accounts: number[]; data: string }[]
    }
  }
}

export type FetchTx = (signature: string) => Promise<RpcTx | null>

export function rpcFetchTx(rpcUrl: string): FetchTx {
  return async (signature) => {
    const call = async (version: number) => {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: version }],
        }),
      })
      if (!res.ok) throw new VerifyError(`RPC error ${res.status}`)
      return (await res.json()) as { result?: RpcTx | null; error?: { message: string } }
    }
    let j = await call(0)
    if (j.error && /version/i.test(j.error.message)) j = await call(1)
    if (j.error) throw new VerifyError(`RPC error: ${j.error.message}`)
    return j.result ?? null
  }
}

/**
 * Proves `signature` is a successful pump.fun create of `mint`, signed by
 * `creator`, whose on-chain symbol normalizes to the ticker being confirmed.
 */
export async function verifyCreateTx(
  fetchTx: FetchTx,
  args: { signature: string; mint: string; creator: string },
): Promise<CreateInfo> {
  const tx = await fetchTx(args.signature)
  if (!tx) throw new VerifyError('Transaction not found yet. Try again in a few seconds.')
  if (!tx.meta || tx.meta.err) throw new VerifyError('Transaction failed on-chain.')
  const msg = tx.transaction.message
  const keys = [...msg.accountKeys, ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])]
  const signers = new Set(msg.accountKeys.slice(0, msg.header.numRequiredSignatures))
  if (!signers.has(args.creator)) throw new VerifyError('Transaction is not signed by the creator wallet.')
  const creates = msg.instructions.filter((ix) => keys[ix.programIdIndex] === PUMP_PROGRAM_ID).flatMap((ix) => {
    try {
      return [{ ix, data: decodeCreateData(bs58.decode(ix.data)) }]
    } catch {
      return []
    }
  })
  if (creates.length !== 1) throw new VerifyError('Transaction does not contain exactly one pump.fun create.')
  const { ix, data } = creates[0]
  const idx = ACCOUNT_INDEX[data.version]
  const mint = keys[ix.accounts[idx.mint]]
  const user = keys[ix.accounts[idx.user]]
  if (mint !== args.mint) throw new VerifyError('Transaction creates a different mint.')
  if (user !== args.creator) throw new VerifyError('Creator wallet is not the pump.fun create user.')
  if (data.creator && data.creator !== args.creator) throw new VerifyError('Coin creator does not match the wallet.')
  return { mint, creator: args.creator, name: data.name, symbol: data.symbol, uri: data.uri, slot: tx.slot, blockTime: tx.blockTime ?? null, signature: args.signature }
}
