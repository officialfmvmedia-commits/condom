# CONDOM

**NO MORE BLOCK ZEROES.** The dev never buys in block 0. Protected pump.fun launches: a create-only transaction (no buys, no side wallets), one optional dev buy that unlocks after block 0 and is hard-capped at 0.3 SOL (≈1% of supply), and a public Launch Report that proves it and names every outside block-0 buyer.

> Every token born from CONDOM is a better coin.

Phase 1: brand + frontend + Launch Report analyzer. The create and dev-buy transaction builders are documented stubs; nothing in this repo sends mainnet transactions.

See `docs/` for details (brand, architecture). Quick start:

```bash
npm install
npm run dev          # real empty states (stub backend)
npm run dev:mocks    # dev-only layout mocks, never bundled
npm run build        # typecheck + build + check-no-mocks
```

## Layout
- `brand/` mark, wordmark, PROTECTED seal, X banner, avatar (SVG + PNG), fonts, generators. See `docs/BRAND.md`.
- `src/` Vite + React + TS frontend. See `docs/ARCHITECTURE.md`.
- `analyzer/` Launch Report analyzer (read-only RPC) + tiny HTTP service. See `docs/LAUNCH_REPORT.md`.
- `screenshots/prod` shipped build (real empty states) · `screenshots/report-live` token page with a real report · `screenshots/dev-mocks` dev-only layout mocks.

```bash
npm run report -- <pump mint>     # JSON Launch Report to stdout
npm run report:serve              # http://localhost:8787/report/<mint>
```
