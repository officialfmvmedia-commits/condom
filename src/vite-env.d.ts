/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC?: string
  readonly VITE_CONDOM_DEV_MOCKS?: string
  readonly VITE_CONDOM_REPORT_API?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
