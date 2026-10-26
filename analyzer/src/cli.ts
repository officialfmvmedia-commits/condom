/**
 * usage: npm run report -- <mint> [--slots 2] [--rpc URL] [--out file.json]
 * Read-only. Uses SOLANA_RPC or public mainnet RPC.
 */
import { writeFileSync } from 'node:fs'
import { analyzeMint } from './analyze'

const args = process.argv.slice(2)
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }
const mint = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
if (!mint) { console.error('usage: npm run report -- <mint> [--slots 2] [--rpc URL] [--out file.json]'); process.exit(1) }

const t0 = Date.now()
const report = await analyzeMint(mint, {
  rpcUrl: flag('rpc'),
  windowSlots: flag('slots') ? Number(flag('slots')) : undefined,
  log: (m) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`),
})
const json = JSON.stringify(report, null, 2)
const out = flag('out')
if (out) { writeFileSync(out, json + '\n'); console.error(`wrote ${out}`) }
else console.log(json)
console.error(`\n${report.grade}  dev ${report.dev.buySol} SOL (${report.dev.buyPctOfSupply}%)  block-0 outsiders ${report.summary.block0Buyers} (${report.summary.block0OutsiderPctOfSupply}%)  dev-funded ${report.summary.devFundedWallets}  create-tx extra buyers ${report.summary.createTxExtraBuyers}`)
