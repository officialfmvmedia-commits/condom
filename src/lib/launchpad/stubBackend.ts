import { NotImplementedError, type LaunchpadBackend, type LaunchReport } from './types'

/**
 * Production default until the on-chain path ships.
 * Reads return honest empty results; writes throw NotImplementedError so nothing is ever signed or sent.
 * If VITE_CONDOM_REPORT_API is set, getLaunchReport() reads real reports from the analyzer service
 * (`npm run report:serve`), which works for any pump.fun mint.
 */
export function createStubBackend(): LaunchpadBackend {
  const reportApi = (import.meta.env.VITE_CONDOM_REPORT_API as string | undefined)?.replace(/\/$/, '')
  return {
    id: 'stub',
    status: 'not-connected',
    async launch() { throw new NotImplementedError('Launching') },
    async buy() { throw new NotImplementedError('Buying') },
    async sell() { throw new NotImplementedError('Selling') },
    async listTokens() { return { items: [] } },
    async getToken() { return null },
    async getTrades() { return [] },
    async getHolders() { return [] },
    async getLaunchReport(mint) {
      if (!reportApi) return null
      const res = await fetch(`${reportApi}/report/${encodeURIComponent(mint)}`)
      if (!res.ok) return null
      return (await res.json()) as LaunchReport
    },
  }
}
