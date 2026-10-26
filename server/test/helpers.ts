import { ed25519 } from '@noble/curves/ed25519.js'
import bs58 from 'bs58'
import { PUMP_PROGRAM_ID, reserveMessage } from '../src/verify'

export function wallet() {
  const secret = ed25519.utils.randomSecretKey()
  const pub = bs58.encode(ed25519.getPublicKey(secret))
  return {
    pub,
    sign(msg: string) {
      return bs58.encode(ed25519.sign(new TextEncoder().encode(msg), secret))
    },
  }
}

export function signedReserve(w: ReturnType<typeof wallet>, display: string, issued = new Date()) {
  const message = reserveMessage(display, w.pub, issued.toISOString())
  return { creator: w.pub, message, signature: w.sign(message) }
}

const str = (s: string) => {
  const b = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(b.length)
  return Buffer.concat([len, b])
}

/** Fake getTransaction(json) result for a pump.fun create_v2 of `mint` by `creator`. */
export function fakeCreateTx(o: { mint: string; creator: string; symbol: string; name?: string; uri?: string; err?: unknown; signer?: string; blockTime?: number }) {
  const data = Buffer.concat([
    Buffer.from([214, 144, 76, 236, 95, 139, 49, 180]),
    str(o.name ?? 'Test Coin'),
    str(o.symbol),
    str(o.uri ?? 'https://ipfs.io/ipfs/bafytest'),
    Buffer.from(bs58.decode(o.creator)),
    Buffer.from([0]),
  ])
  const signer = o.signer ?? o.creator
  const filler = (n: number) => bs58.encode(Buffer.alloc(32, n))
  // keys: [signer, mint, ...pump accounts..., program]
  const accountKeys = [signer, o.mint, filler(3), filler(4), filler(5), filler(6), PUMP_PROGRAM_ID]
  // create_v2 accounts: mint(0) ... user(5)
  const accounts = [1, 2, 3, 4, 5, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6]
  return {
    slot: 123,
    blockTime: o.blockTime ?? Math.floor(Date.now() / 1000),
    meta: { err: o.err ?? null, loadedAddresses: { writable: [], readonly: [] } },
    transaction: {
      signatures: ['sig'],
      message: {
        accountKeys,
        header: { numRequiredSignatures: 2 },
        instructions: [{ programIdIndex: 6, accounts, data: bs58.encode(data) }],
      },
    },
  }
}
