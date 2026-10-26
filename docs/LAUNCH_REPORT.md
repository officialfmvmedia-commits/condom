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
| Dev in block 0 | the dev bought in the creation slot, including inside the create tx → fail (the core rule) |
| Dev buy size | dev SOL across the window > 0.3 SOL (+0.005), or > 1.07% of supply when SOL can't be read → fail |
| Bundle check | anyone other than the dev bought inside the create tx → fail |
| Dev-funded wallets | any early buyer funded directly by the dev → fail |
| Outside block-0 buys | outsiders hold ≥ 5% of supply from block 0 → warn (always named) |
| Launch-slot tips | create tx and block-0 buys both paid Jito tips → warn |

Grade: any fail → **UNPROTECTED**; else any warn → **CAUTION**; else **PROTECTED**.
`summarize()` is pure, so `npx tsx analyzer/src/regrade.ts docs/sample-reports/*.json` re-applies changed rules to saved reports without touching the chain data (the samples below were regraded after the dev-in-block-0 rule was added).

## Real mainnet samples (Oct 26, 2026, public RPC, read-only)
Full JSON in `docs/sample-reports/`. None of these coins were launched through CONDOM.

| Mint | Create slot (time) | Grade | Dev in block 0 | Dev buy | Outside block-0 · supply | Dev-funded | Extra buyers in create tx |
|---|---|---|---|---|---|---|---|
| `3AdmiQuiyA3P5NCcWpH1KQHBNnx8UW2pfcwYBbLNpump` | 461615756 (5:37 AM ET) | **UNPROTECTED** | yes | 0.030 SOL · 0.11% | 3 · 32.11% | 0 | 0 |
| `3nUV4CyHGteV2PSid5e9QYjeEZo1rTm8XHakZJDbpump` | 461618609 (5:47 AM ET) | **UNPROTECTED** | yes | 5.000 SOL · 15.33% | 3 · 14.03% | 2 | 0 |
| `4s8sgnzY7Psc78kUVLD5bjJbMZaYceHvGb1uZPfEpump` | 461622659 (6:02 AM ET) | **PROTECTED** | no | 0.000 SOL · 0.00% | 0 · 0.00% | 0 | 0 |
| `5XzHBcL4unitQwVuwQuztKM4ix5CJYjmLaH9LKobpump` | 461618322 (5:46 AM ET) | **UNPROTECTED** | yes | 0.097 SOL · 0.17% | 0 · 0.00% | 0 | 0 |
| `5j3T3RNva9gk9WnywNbTcLZoJnyttmQtaWRL389qpump` | 461618429 (5:47 AM ET) | **UNPROTECTED** | yes | 0.000 SOL · 0.03% | 0 · 0.00% | 0 | 0 |
| `AjQk4b4iSgRa9rwQxuMoqwU7L5KzLLakLtHi4Phnpump` | 461617469 (5:43 AM ET) | **UNPROTECTED** | yes | 85.005 SOL · 79.32% | 1 · 19.88% | 0 | 0 |
| `D9rUA8G3q2tAwWgCbhuhn79woXMnSxBFo3eRJyY7pump` | 461621154 (5:56 AM ET) | **UNPROTECTED** | yes | 3.000 SOL · 9.75% | 2 · 8.81% | 0 | 0 |
| `EVZjn7db5Z1VpieQtiJdbsfMhhBUVcg8rhEuFTiupump` | 461618646 (5:47 AM ET) | **UNPROTECTED** | yes | 3.000 SOL · 9.75% | 3 · 12.61% | 1 | 0 |
| `EfGYMka1TEudi8pEQCYyuq5RLsRRAa78Ley9XyxTpump` | 461618372 (5:46 AM ET) | **UNPROTECTED** | yes | 0.104 SOL · 0.18% | 0 · 0.00% | 1 | 0 |

Notable:
- Every sampled coin whose dev bought did so inside the create tx (block 0), which is exactly what CONDOM's create-only transaction rules out. Under the new core rule they all grade UNPROTECTED.
- **4s8sgnzY…pump**: a create with no buy (the CONDOM pattern); nobody bought in the window → PROTECTED.
- **EfGYMka1…pump**: dev buy only 0.104 SOL, but the create transaction also sent 0.105 SOL from the dev to `E6B3Fg…izdRo`, which bought 2 slots later. Flagged as a dev-funded side wallet (funding tx `2qUHJZMQ…9kJcT`, verified by balance changes).
- **3AdmiQui…pump**: 3 outsiders took 32% of supply in block 0, all named.
- **AjQk4b4i…pump**: dev bought the whole curve (85 SOL, 79.3%) and it graduated in the launch block; one wallet then bought 19.9% on the AMM in the same block.
- **5j3T3RNv…pump**: the dev's create-tx buy reported 0 SOL (non-SOL quote curve), so the size check falls back to % of supply.
- **5XzHBcL4…pump**: a 2B-supply coin.

## Limits (also stated in the app)
- Funding trace is 1 hop. Multi-hop or exchange-routed funding passes.
- Public RPC is rate-limited; coins with very long histories need an indexed RPC (or a creation-signature hint, not implemented yet).
- A wrapper can't block outside block-0 buys. The report names them and proves the dev wasn't one of them.
