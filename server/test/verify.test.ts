import { describe, expect, it } from 'vitest'
import { verifyCreateTx, verifyReserveSignature, VerifyError } from '../src/verify'
import { fakeCreateTx, signedReserve, wallet } from './helpers'

describe('verifyReserveSignature', () => {
  it('accepts a fresh signature by the creator', () => {
    const w = wallet()
    const r = signedReserve(w, 'PEPE')
    expect(() => verifyReserveSignature({ display: 'PEPE', ...r })).not.toThrow()
  })
  it('rejects another wallet, another ticker, tampering and stale messages', () => {
    const w = wallet(), x = wallet()
    const r = signedReserve(w, 'PEPE')
    expect(() => verifyReserveSignature({ display: 'PEPE', ...r, creator: x.pub })).toThrow(VerifyError)
    expect(() => verifyReserveSignature({ display: 'BONK', ...r })).toThrow(VerifyError)
    expect(() => verifyReserveSignature({ display: 'PEPE', ...r, signature: x.sign(r.message) })).toThrow(/invalid/)
    const old = signedReserve(w, 'PEPE', new Date(Date.now() - 6 * 60_000))
    expect(() => verifyReserveSignature({ display: 'PEPE', ...old })).toThrow(/expired/)
  })
})

describe('verifyCreateTx', () => {
  const w = wallet(), m = wallet()
  it('accepts a pump.fun create_v2 of the mint signed by the creator', async () => {
    const info = await verifyCreateTx(async () => fakeCreateTx({ mint: m.pub, creator: w.pub, symbol: 'PEPE' }) as any, { signature: 's', mint: m.pub, creator: w.pub })
    expect(info.symbol).toBe('PEPE')
    expect(info.mint).toBe(m.pub)
  })
  it('rejects wrong mint, wrong signer, failed tx, missing tx', async () => {
    const other = wallet()
    const ok = (o: any) => async () => fakeCreateTx({ mint: m.pub, creator: w.pub, symbol: 'PEPE', ...o }) as any
    await expect(verifyCreateTx(ok({}), { signature: 's', mint: other.pub, creator: w.pub })).rejects.toThrow(/different mint/)
    await expect(verifyCreateTx(ok({ signer: other.pub }), { signature: 's', mint: m.pub, creator: w.pub })).rejects.toThrow(/not signed/)
    await expect(verifyCreateTx(ok({ err: { InstructionError: [0, 'x'] } }), { signature: 's', mint: m.pub, creator: w.pub })).rejects.toThrow(/failed/)
    await expect(verifyCreateTx(async () => null, { signature: 's', mint: m.pub, creator: w.pub })).rejects.toThrow(/not found/)
  })
})
