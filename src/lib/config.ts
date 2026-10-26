/** Runtime endpoints, set at build time on Render (Static Site → Environment). */
export const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com'
export const DEFAULT_API_URL = 'https://condom-api.onrender.com'

export const RPC_URL: string = (import.meta.env.VITE_RPC_URL || import.meta.env.VITE_SOLANA_RPC || DEFAULT_RPC_URL).trim()
export const API_URL: string = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).trim().replace(/\/+$/, '')
