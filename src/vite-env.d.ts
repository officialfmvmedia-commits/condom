/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string
  /** @deprecated use VITE_RPC_URL */
  readonly VITE_SOLANA_RPC?: string
  readonly VITE_API_URL?: string
  readonly VITE_CONDOM_DEV_MOCKS?: string
  readonly VITE_CONDOM_REPORT_API?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
