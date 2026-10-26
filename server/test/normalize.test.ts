import { describe, expect, it } from 'vitest'
import { displayTicker, normalizeTicker, TickerError } from '../src/normalize'

describe('normalizeTicker', () => {
  it('uppercases, trims and strips leading $', () => {
    expect(normalizeTicker('  $pepe ')).toBe('PEPE')
    expect(normalizeTicker('$$Pepe')).toBe('PEPE')
    expect(displayTicker(' $pepe ')).toBe('PEPE')
  })
  it('folds 0/O and 1/I/L', () => {
    expect(normalizeTicker('B0NK')).toBe(normalizeTicker('BONK'))
    expect(normalizeTicker('WIF1')).toBe(normalizeTicker('WIFL'))
    expect(normalizeTicker('wifl')).toBe(normalizeTicker('WIFI'))
    expect(normalizeTicker('M00N')).toBe('MOON')
  })
  it('folds Cyrillic and Greek lookalikes', () => {
    expect(normalizeTicker('РЕРЕ')).toBe('PEPE') // Cyrillic Er/Ie
    expect(normalizeTicker('ΡΕΡΕ')).toBe('PEPE') // Greek Rho/Epsilon
    expect(normalizeTicker('сат')).toBe('CAT') // lowercase Cyrillic
  })
  it('strips zero-width and combining characters', () => {
    expect(normalizeTicker('PE\u200BPE')).toBe('PEPE')
    expect(normalizeTicker('\uFEFFPEPE\u200D')).toBe('PEPE')
    expect(normalizeTicker('PÉPE')).toBe('PEPE')
  })
  it('applies NFKC (full-width, ligatures)', () => {
    expect(normalizeTicker('ＰＥＰＥ')).toBe('PEPE')
  })
  it('rejects empty, too long, and junk', () => {
    expect(() => normalizeTicker('$')).toThrow(TickerError)
    expect(() => normalizeTicker('\u200B')).toThrow(TickerError)
    expect(() => normalizeTicker('ABCDEFGHIJK')).toThrow(TickerError)
    expect(() => normalizeTicker('PE PE')).not.toThrow()
    expect(() => normalizeTicker('<script>')).toThrow(TickerError)
  })
})
