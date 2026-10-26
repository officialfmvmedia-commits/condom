import type { LaunchpadBackend } from './types'
import { createStubBackend } from './stubBackend'

export * from './types'

let backendPromise: Promise<LaunchpadBackend> | null = null

/**
 * Returns the active backend.
 * Dev-only screenshot mocks load ONLY when running `vite` in dev mode with VITE_CONDOM_DEV_MOCKS=1.
 * `import.meta.env.DEV` is a compile-time `false` in production builds, so the mock module is
 * dead code there and is never bundled; scripts/check-no-mocks.mjs verifies this after every build.
 */
export function getBackend(): Promise<LaunchpadBackend> {
  if (!backendPromise) {
    if (import.meta.env.DEV && import.meta.env.VITE_CONDOM_DEV_MOCKS === '1') {
      backendPromise = import('../../dev/mockBackend').then((m) => m.createMockBackend())
    } else {
      backendPromise = Promise.resolve(createStubBackend())
    }
  }
  return backendPromise
}
