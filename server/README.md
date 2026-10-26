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

Env: `DATABASE_URL` (required), `RPC_URL`, `PINATA_JWT`, `ALLOWED_ORIGINS` (optional), `PORT`, `PGSSL=on|off` (override).
CORS: thecondom.fun, www.thecondom.fun, localhost.

```
npm ci
DATABASE_URL=postgres://… npm start
TEST_DATABASE_URL=postgres://… npm test   # DB tests skip without it
```
