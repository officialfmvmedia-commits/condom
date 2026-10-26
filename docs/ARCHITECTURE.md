# Architecture (phase 1)

Decision: CONDOM is a **pump.fun wrapper**. Coins are real pump.fun tokens.
- **Enforced** (by the launch tx CONDOM builds): dev buy ≤ 0.3 SOL; create + dev buy in one transaction; only creator + mint keypair sign; no other buyers or bundle tips in that tx.
- **Exposed** (Launch Report, read from chain): block-0 buyers, early buyers (creation slot + 2), wallets funded 1 hop by the dev, Jito-tipped buys in the launch slot.
- **Not claimed:** a wrapper can't stop anyone buying on pump.fun directly in block 0. Copy says snipers get *named*, never *blocked*.

## Layout
```
src/
  lib/rules.ts               every protocol number (0.3 SOL cap, window, thresholds)
  lib/curve.ts               pump.fun curve math (30 SOL / 1.073B virtual) → "≈1% of supply"
  lib/launchpad/types.ts     LaunchpadBackend interface: launch/buy/sell/listTokens/getToken/getTrades/getHolders/getLaunchReport
  lib/launchpad/report.ts    LaunchReport schema (shared with analyzer)
  lib/launchpad/stubBackend.ts  production default: empty reads, writes throw NotImplementedError;
                                getLaunchReport reads the analyzer service if VITE_CONDOM_REPORT_API is set
  lib/launchpad/launchTxBuilder.ts  documented stub for create+buy (pump.fun program or PumpPortal), cap assertion
  lib/launchpad/index.ts     getBackend(): stub in prod; dev mocks only if import.meta.env.DEV && VITE_CONDOM_DEV_MOCKS=1
  dev/mockBackend.ts         DEV-ONLY fake data (sentinel __CONDOM_DEV_MOCK__), labelled in UI
  wallet/                    wallet-adapter (Phantom, Solflare; Backpack via Wallet Standard) + custom modal
  pages/ Home, Launch, Token, Rules, NotFound
analyzer/src/
  rpc.ts         read-only JSON-RPC client (method allowlist, pacing, 429 backoff, tx version 1 support)
  pumpEvents.ts  pump.fun TradeEvent decoder
  analyze.ts     analyzeMint(mint) → LaunchReport
  cli.ts         npm run report -- <mint> [--slots 2] [--rpc URL] [--out f.json]
  server.ts      npm run report:serve → GET /report/:mint (disk-cached)
scripts/
  check-no-mocks.mjs  runs after every `npm run build`; fails if mock code is in dist/
  screenshots.mjs     headless Chromium, 1440 + 390 widths
```

## Plugging in a real backend
Implement `LaunchpadBackend` (e.g. `pumpWrapperBackend.ts`) and return it from `getBackend()`. `launch()` should call `buildLaunchTransaction()` (once implemented), have the wallet sign, send, then register the mint with the indexer that powers `listTokens/getTrades/getHolders`.

## Mock safety
- Mocks are only reachable behind `import.meta.env.DEV`, a compile-time `false` in production, so the dynamic import is dead code.
- `scripts/check-no-mocks.mjs` greps dist/ for the sentinel and mock strings; verified to fail the build when the dev ribbon leaked during development.
