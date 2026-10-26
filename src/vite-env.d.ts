/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Dev-only RPC override (ignored in production builds). */
  readonly VITE_RPC_URL?: string
  readonly VITE_API_URL?: string
  readonly VITE_CONDOM_DEV_MOCKS?: string
  readonly VITE_CONDOM_REPORT_API?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
