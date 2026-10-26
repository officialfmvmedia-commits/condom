# Launch Report analyzer

`analyzer/` reads the chain (read-only JSON-RPC, no keys, method allowlist) and produces a `LaunchReport` (schema: `src/lib/launchpad/report.ts`) for any pump.fun mint.

```bash
npm run report -- <mint> [--slots 2] [--rpc URL] [--out report.json]
npm run report:serve                     # GET http://localhost:8787/report/<mint>
VITE_CONDOM_REPORT_API=http://localhost:8787 npm run dev   # token pages show real reports
```

## Method
1. Walk `getSignaturesForAddress(mint)` back to the oldest signature (cap: 40 pages); the first successful tx running pump.fun `Create`/`CreateV2` is the launch. Creator = its fee payer.
2. Bonding curve = owner of the largest token balance right after create. Supply from `getTokenSupply` (pump.fun now has 1B **and** 2B-supply coins, so % is computed from real supply).
3. Fetch every successful tx in slots `creation .. creation+N` (N=2 default).
4. Buys: decode pump.fun **TradeEvent** logs (exact SOL, tokens, buyer). Fallback for AMM/routed buys (e.g. instant graduation to PumpSwap): token-balance deltas, SOL = buyer's SOL+wSOL outflow. Graduation (`Migrate`) txs are excluded.
5. Side wallets (1 hop): index the dev wallet's signatures before the create (up to 3000) plus the window txs; for each early outsider, intersect with their history before their first buy and confirm a dev→buyer SOL transfer in that tx.
6. Jito: a tx is "tipped" if a Jito tip account gains lamports.

## Checks and grade
| Check | Fail / warn when |
|---|---|
| Dev buy | dev SOL across the window > 0.3 SOL (+0.005 tolerance) → fail |
| Bundle check | anyone other than the dev bought inside the create tx → fail |
| Dev-funded wallets | any early buyer funded directly by the dev → fail |
| Block-0 buys | outsiders hold ≥ 5% of supply from block 0 → warn (always named) |
| Launch-slot tips | create tx and block-0 buys both paid Jito tips → warn |

Grade: any fail → **UNPROTECTED**; else any warn → **CAUTION**; else **PROTECTED**.

## Real mainnet samples (Oct 26, 2026, public RPC, read-only)
Full JSON in `docs/sample-reports/`.

| Mint | Create slot (time) | Grade | Dev buy | Block-0 outsiders · supply | Dev-funded | Extra buyers in create tx |
|---|---|---|---|---|---|---|
| `3AdmiQuiyA3P5NCcWpH1KQHBNnx8UW2pfcwYBbLNpump` | 461615756 (5:37 AM ET) | **CAUTION** | 0.030 SOL · 0.11% | 3 · 32.11% | 0 | 0 |
| `3nUV4CyHGteV2PSid5e9QYjeEZo1rTm8XHakZJDbpump` | 461618609 (5:47 AM ET) | **UNPROTECTED** | 5.000 SOL · 15.33% | 3 · 14.03% | 2 | 0 |
| `5XzHBcL4unitQwVuwQuztKM4ix5CJYjmLaH9LKobpump` | 461618322 (5:46 AM ET) | **PROTECTED** | 0.097 SOL · 0.17% | 0 · 0.00% | 0 | 0 |
| `AjQk4b4iSgRa9rwQxuMoqwU7L5KzLLakLtHi4Phnpump` | 461617469 (5:43 AM ET) | **UNPROTECTED** | 85.005 SOL · 79.32% | 1 · 19.88% | 0 | 0 |
| `D9rUA8G3q2tAwWgCbhuhn79woXMnSxBFo3eRJyY7pump` | 461621154 (5:56 AM ET) | **UNPROTECTED** | 3.000 SOL · 9.75% | 2 · 8.81% | 0 | 0 |
| `EVZjn7db5Z1VpieQtiJdbsfMhhBUVcg8rhEuFTiupump` | 461618646 (5:47 AM ET) | **UNPROTECTED** | 3.000 SOL · 9.75% | 3 · 12.61% | 1 | 0 |
| `EfGYMka1TEudi8pEQCYyuq5RLsRRAa78Ley9XyxTpump` | 461618372 (5:46 AM ET) | **UNPROTECTED** | 0.104 SOL · 0.18% | 0 · 0.00% | 1 | 0 |

Notable:
- **EfGYMka1…pump**: dev buy was only 0.104 SOL (within cap), but the create transaction itself sent 0.105 SOL from the dev to `E6B3Fg…izdRo`, which bought 2 slots later. Flagged as a dev-funded side wallet → UNPROTECTED. (Funding tx `2qUHJZMQ…9kJcT`, verified by balance changes.)
- **3AdmiQui…pump**: clean dev (0.03 SOL), but 3 outsiders took 32% of supply in block 0 → CAUTION, all three named.
- **AjQk4b4i…pump**: dev bought the whole curve (85 SOL, 79.3%), graduated in the launch block, and one wallet bought 19.9% on the AMM in the same block.
- **5XzHBcL4…pump**: a 2B-supply coin; 0.097 SOL dev buy, nobody else in the window → PROTECTED.

## Limits (also stated in the app)
- Funding trace is 1 hop. Multi-hop or exchange-routed funding passes.
- Public RPC is rate-limited; coins with very long histories need an indexed RPC (or a creation-signature hint, not implemented yet).
- A wrapper can't block outside block-0 buys. The report names them.
