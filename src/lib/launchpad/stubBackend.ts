import { NotImplementedError, type LaunchpadBackend } from './types'

/**
 * Production default until the on-chain path ships.
 * Reads return honest empty results; writes throw NotImplementedError so nothing is ever signed or sent.
 */
export function createStubBackend(): LaunchpadBackend {
  return {
    id: 'stub',
    status: 'not-connected',
    async launch() { throw new NotImplementedError('Launching') },
    async devBuy() { throw new NotImplementedError('The dev buy') },
    async buy() { throw new NotImplementedError('Buying') },
    async sell() { throw new NotImplementedError('Selling') },
    async listTokens() { return { items: [] } },
    async getToken() { return null },
    async getTrades() { return [] },
    async getHolders() { return [] },
  }
}
