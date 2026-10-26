/**
 * Runtime endpoints.
 * Production: the only build-time setting is VITE_API_URL. All Solana JSON-RPC goes through
 * `${API_URL}/rpc`, a server-side proxy that holds the paid RPC key; no RPC key ever ships
 * in this bundle. VITE_RPC_URL is honoured ONLY in `vite dev` (local override) and is
 * compiled out of production builds (scripts/check-no-mocks.mjs fails the build on 'helius'/'api-key').
 */
export const DEFAULT_API_URL = 'https://condom-api.onrender.com'

export const API_URL: string = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).trim().replace(/\/+$/, '')

const devRpcOverride: string | undefined = import.meta.env.DEV ? import.meta.env.VITE_RPC_URL : undefined

export const RPC_URL: string = (devRpcOverride || `${API_URL}/rpc`).trim()
