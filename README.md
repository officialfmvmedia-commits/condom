# CONDOM

**NO MORE BLOCK ZEROES.** Protected pump.fun launches: dev buy hard-capped at 0.3 SOL (≈1% of supply), create + dev buy in one transaction with no side wallets, and a public Launch Report that names every block-0 buyer.

> Every token born from CONDOM is a better coin.

Phase 1: brand + frontend + Launch Report analyzer. The launch transaction builder is a documented stub; nothing in this repo sends mainnet transactions.

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
