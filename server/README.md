# CONDOM API

Ticker registry (NO VAMPS) + IPFS metadata upload. Hono on Node 20, Postgres.

| Endpoint | What |
|---|---|
| `GET /tickers/:t[?creator=]` | availability: `available` / `reserved` / `live` (+ coin) |
| `POST /tickers/reserve` `{ticker, creator, message, signature}` | 10 min hold; `message` = `CONDOM: reserve $<TICKER> for <wallet>\nissued: <ISO>` signed by the wallet |
| `POST /tickers/confirm` `{ticker, mint, signature, creator}` | verifies the pump.fun create tx via RPC, marks live |
| `GET /coins`, `GET /coins/:mint` | live CONDOM coins |
| `POST /ipfs` multipart `file,name,symbol,description,twitter,telegram,website` | Pinata upload, returns `{metadataUri, imageUri}` |
| `GET /health` | DB check |

Genesis watcher: if `GENESIS_CREATORS` is set, every ~20s (`GENESIS_POLL_MS`) the server reads each wallet's signatures (`getSignaturesForAddress`, cursor stored in `genesis_watch`), finds pump.fun create/create_v2 (top-level or CPI) signed by that wallet, and registers the coin live with `genesis=true, born_order=n`. First create per wallet only (`GENESIS_MAX_PER_CREATOR`, default 1). `/coins` lists genesis coins first.

Env: `DATABASE_URL` (required), `GENESIS_CREATORS`, `GENESIS_MAX_PER_CREATOR`, `GENESIS_POLL_MS`, `RPC_URL`, `PINATA_JWT`, `ALLOWED_ORIGINS` (optional), `PORT`, `PGSSL=on|off` (override).
CORS: thecondom.fun, www.thecondom.fun, localhost.

```
npm ci
DATABASE_URL=postgres://… npm start
TEST_DATABASE_URL=postgres://… npm test   # DB tests skip without it
```
