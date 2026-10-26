# Architecture (phase 1)

Decision: CONDOM is a **pump.fun wrapper**. Coins are real pump.fun tokens.
**Core rule, NO MORE BLOCK ZEROES: the dev never buys in block 0.**
- **Enforced** (by the transactions CONDOM builds):
  1. *Create*: a create-only transaction. No buy of any kind; only creator + mint keypair sign; no bundle tips, no SOL transfers out.
  2. *Dev buy* (optional, one): unlocks only when the chain is ≥ `RULES.DEV_BUY_MIN_SLOTS_AFTER_CREATE` (2) slots past the creation slot; ≤ 0.3 SOL (≈1.06% on a fresh curve, less if others bought first). The UI polls the slot and shows a countdown; the builder re-checks the slot itself.
- **Exposed** (Launch Report, read from chain): proof the dev's first buy came after block 0, outside block-0 buyers (named), early buyers (creation slot + 2), wallets funded 1 hop by the dev, Jito-tipped buys in the launch slot.
- **Not claimed:** a wrapper can't stop outsiders buying on pump.fun directly in block 0. Copy says outside snipers get *named*, never *blocked*.

## Layout
```
src/
  lib/rules.ts               every protocol number (0.3 SOL cap, window, thresholds)
  lib/curve.ts               pump.fun curve math (30 SOL / 1.073B virtual) → "≈1% of supply"
  lib/launchpad/types.ts     LaunchpadBackend: launch (create only) / devBuy (after block 0) / buy / sell / listTokens / getToken / getTrades / getHolders / getLaunchReport
  lib/useSlotGate.ts         polls getSlot; slots left until the dev buy unlocks
  lib/launchpad/report.ts    LaunchReport schema (shared with analyzer)
  lib/launchpad/stubBackend.ts  production default: empty reads, writes throw NotImplementedError;
                                getLaunchReport reads the analyzer service if VITE_CONDOM_REPORT_API is set
  lib/launchpad/launchTxBuilder.ts  documented stubs: buildCreateTransaction (no buy) + buildDevBuyTransaction (slot gate + cap asserts)
  lib/launchpad/index.ts     getBackend(): stub in prod; dev mocks only if import.meta.env.DEV && VITE_CONDOM_DEV_MOCKS=1
  dev/mockBackend.ts         DEV-ONLY fake data (sentinel __CONDOM_DEV_MOCK__), labelled in UI
  wallet/                    wallet-adapter (Phantom, Solflare; Backpack via Wallet Standard) + custom modal
  pages/ Home, Launch, Token, Rules, NotFound
analyzer/src/
  rpc.ts         read-only JSON-RPC client (method allowlist, pacing, 429 backoff, tx version 1 support)
  pumpEvents.ts  pump.fun TradeEvent decoder
  analyze.ts     analyzeMint(mint) → LaunchReport; summarize() = pure checks + grade
  regrade.ts     re-apply current rules to saved reports
  cli.ts         npm run report -- <mint> [--slots 2] [--rpc URL] [--out f.json]
  server.ts      npm run report:serve → GET /report/:mint (disk-cached)
scripts/
  check-no-mocks.mjs  runs after every `npm run build`; fails if mock code is in dist/
  screenshots.mjs     headless Chromium, 1440 + 390 widths
```

## Plugging in a real backend
Implement `LaunchpadBackend` (e.g. `pumpWrapperBackend.ts`) and return it from `getBackend()`. `launch()` builds the create-only tx (`buildCreateTransaction`), has the wallet sign, sends, and returns the confirmed creation slot. `devBuy()` must call `buildDevBuyTransaction(params, currentSlot)` so the slot gate and cap are enforced server-side of the UI too. Then register the mint with the indexer behind `listTokens/getTrades/getHolders`.

## Mock safety
- Mocks are only reachable behind `import.meta.env.DEV`, a compile-time `false` in production, so the dynamic import is dead code.
- `scripts/check-no-mocks.mjs` greps dist/ for the sentinel and mock strings; verified to fail the build when the dev ribbon leaked during development.
