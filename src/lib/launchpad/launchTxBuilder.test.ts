import { describe, expect, it } from 'vitest'
import {
  ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js'
import {
  assertCleanCreate, assertCleanDevBuy, assertDevBuyAllowed, assertDevBuyAmount, devBuyLamports, devBuyUnlockSlot,
  MAX_DEV_BUY_LAMPORTS,
} from './launchTxBuilder'

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
const BUY_DISC = [225, 247, 80, 30, 213, 179, 132, 136]
const CREATE_DISC = [214, 144, 76, 236, 95, 139, 49, 180]

const u64 = (n: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b }
const buyIx = (user: PublicKey, lamports: bigint) => new TransactionInstruction({
  programId: PUMP,
  keys: [{ pubkey: user, isSigner: true, isWritable: true }],
  data: Buffer.from([...BUY_DISC, ...u64(lamports), ...u64(1n), 0]),
})
const createIx = (user: PublicKey, mint: PublicKey) => new TransactionInstruction({
  programId: PUMP,
  keys: [{ pubkey: mint, isSigner: true, isWritable: true }, { pubkey: user, isSigner: true, isWritable: true }],
  data: Buffer.from([...CREATE_DISC, 0, 0, 0, 0]),
})
const tx = (payer: PublicKey, ixs: TransactionInstruction[]) => new VersionedTransaction(
  new TransactionMessage({ payerKey: payer, recentBlockhash: PublicKey.default.toBase58(), instructions: ixs }).compileToV0Message(),
)
const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 })

describe('dev buy cap', () => {
  it('allows 0 to 0.3 SOL', () => {
    for (const s of [0, 0.01, 0.1, 0.25, 0.3]) expect(() => assertDevBuyAmount(s)).not.toThrow()
    expect(devBuyLamports(0.3)).toBe(300_000_000)
    expect(MAX_DEV_BUY_LAMPORTS).toBe(300_000_000)
  })
  it('rejects anything above 0.3 SOL and junk', () => {
    for (const s of [0.30000001, 0.31, 0.5, 1, 100]) expect(() => assertDevBuyAmount(s)).toThrow(/Max dev buy is 0.3 SOL/)
    for (const s of [-1, NaN, Infinity]) expect(() => assertDevBuyAmount(s)).toThrow()
    expect(() => devBuyLamports(0.31)).toThrow()
  })
})

describe('block zero gate', () => {
  it('unlocks at creation slot + 2', () => {
    expect(devBuyUnlockSlot(1000)).toBe(1002)
    expect(() => assertDevBuyAllowed(0.1, 1000, 1000)).toThrow(/after block 0/)
    expect(() => assertDevBuyAllowed(0.1, 1000, 1001)).toThrow(/after block 0/)
    expect(() => assertDevBuyAllowed(0.1, 1000, 1002)).not.toThrow()
  })
  it('still applies the cap after unlock, and rejects a zero buy', () => {
    expect(() => assertDevBuyAllowed(0.31, 1000, 5000)).toThrow(/0.3 SOL/)
    expect(() => assertDevBuyAllowed(0, 1000, 5000)).toThrow(/Nothing to buy/)
  })
})

describe('assertCleanDevBuy', () => {
  const dev = Keypair.generate().publicKey
  it('accepts one capped buy', () => {
    expect(() => assertCleanDevBuy(tx(dev, [cu, buyIx(dev, 300_000_000n)]), dev)).not.toThrow()
  })
  it('rejects a buy above the cap, two buys, SOL transfers and extra signers', () => {
    expect(() => assertCleanDevBuy(tx(dev, [cu, buyIx(dev, 300_000_001n)]), dev)).toThrow(/over 0.3/)
    expect(() => assertCleanDevBuy(tx(dev, [buyIx(dev, 1n), buyIx(dev, 1n)]), dev)).toThrow(/exactly one/)
    const tip = SystemProgram.transfer({ fromPubkey: dev, toPubkey: Keypair.generate().publicKey, lamports: 1000 })
    expect(() => assertCleanDevBuy(tx(dev, [buyIx(dev, 1n), tip]), dev)).toThrow(/transfer/)
    const other = Keypair.generate().publicKey
    expect(() => assertCleanDevBuy(tx(dev, [buyIx(dev, 1n), buyIx(other, 1n)]), dev)).toThrow(/creator only/)
  })
})

describe('assertCleanCreate', () => {
  const dev = Keypair.generate().publicKey, mint = Keypair.generate().publicKey
  it('accepts create only', () => {
    expect(() => assertCleanCreate(tx(dev, [cu, createIx(dev, mint)]), dev, mint)).not.toThrow()
  })
  it('rejects a create with a buy (block-zero bundle) or a tip', () => {
    expect(() => assertCleanCreate(tx(dev, [createIx(dev, mint), buyIx(dev, 1n)]), dev, mint)).toThrow(/disallowed/)
    const tip = SystemProgram.transfer({ fromPubkey: dev, toPubkey: Keypair.generate().publicKey, lamports: 1000 })
    expect(() => assertCleanCreate(tx(dev, [createIx(dev, mint), tip]), dev, mint)).toThrow(/disallowed/)
  })
})
