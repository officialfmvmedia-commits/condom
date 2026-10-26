/**
 * DEV-ONLY screenshot mocks. __CONDOM_DEV_MOCK__
 * Loaded only by `getBackend()` when import.meta.env.DEV && VITE_CONDOM_DEV_MOCKS=1.
 * Must never appear in a production bundle; scripts/check-no-mocks.mjs fails the build if it does.
 * Every value here is fabricated for layout testing and is labelled as such in the UI.
 */
import { NotImplementedError, type LaunchpadBackend, type TokenSummary, type Trade, type Holder } from '../lib/launchpad/types'

export const DEV_MOCK_SENTINEL = '__CONDOM_DEV_MOCK__'

const fake = (i: number) => `MOCK${String(i).padStart(4, '0')}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.slice(0, 44)
const now = Date.now()
const names: [string, string][] = [
  ['Mock Alpha', 'MALPHA'], ['Mock Bravo', 'MBRAVO'], ['Mock Charlie', 'MCHAR'], ['Mock Delta', 'MDELTA'],
  ['Mock Echo', 'MECHO'], ['Mock Foxtrot', 'MFOX'], ['Mock Golf', 'MGOLF'], ['Mock Hotel', 'MHOTEL'],
]
const tokens: TokenSummary[] = names.map(([name, symbol], i) => ({
  mint: fake(i), name, symbol, imageUrl: null,
  description: 'Dev mock token for layout screenshots. Not real.',
  creator: fake(100 + i), createdAt: now - (i + 1) * 7 * 60_000,
  marketCapSol: 28 + i * 9.5, curveProgress: Math.min(0.97, 0.06 + i * 0.12), devBuyPct: 0.4 + (i % 3) * 0.3,
  grade: i % 4 === 3 ? 'CAUTION' : 'PROTECTED',
}))
const trades: Trade[] = Array.from({ length: 8 }, (_, i) => ({
  signature: fake(200 + i), mint: tokens[0].mint, side: i % 3 === 2 ? 'sell' : 'buy', trader: fake(300 + i),
  sol: 0.1 + i * 0.07, tokens: 2_000_000 + i * 310_000, timestamp: now - i * 41_000, slot: 300_000_000 + i,
}))
const holders: Holder[] = [
  { owner: fake(400), amount: 793_100_000, pct: 79.31, tag: 'curve' },
  { owner: fake(100), amount: 10_600_000, pct: 1.06, tag: 'dev' },
  ...Array.from({ length: 5 }, (_, i) => ({ owner: fake(401 + i), amount: 9_000_000 - i * 1_200_000, pct: 0.9 - i * 0.12 })),
]

export function createMockBackend(): LaunchpadBackend {
  return {
    id: 'dev-mock',
    status: 'live',
    async launch() { throw new NotImplementedError('Launching (dev mock)') },
    async devBuy() { throw new NotImplementedError('The dev buy (dev mock)') },
    async buy() { throw new NotImplementedError('Buying (dev mock)') },
    async sell() { throw new NotImplementedError('Selling (dev mock)') },
    async listTokens(q) {
      const s = q.search?.toLowerCase()
      let items = s ? tokens.filter((t) => t.name.toLowerCase().includes(s) || t.symbol.toLowerCase().includes(s)) : tokens
      if (q.sort === 'graduating') items = [...items].sort((a, b) => b.curveProgress - a.curveProgress)
      if (q.sort === 'rising') items = [...items].sort((a, b) => (b.marketCapSol ?? 0) - (a.marketCapSol ?? 0))
      return { items }
    },
    async getToken(mint) { return tokens.find((t) => t.mint === mint) ?? tokens[0] },
    async getTrades() { return trades },
    async getHolders() { return holders },
    async getLaunchReport() { return null },
  }
}
