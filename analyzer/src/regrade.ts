/**
 * Re-applies the current rules (summarize()) to saved reports without re-reading the chain.
 * usage: npx tsx analyzer/src/regrade.ts docs/sample-reports/*.json
 * The on-chain data (earlyBuys, creation, window) is untouched; only dev stats, summary, checks, grade change.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { summarize } from './analyze'
import type { LaunchReport } from '../../src/lib/launchpad/report'

for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, 'utf8')) as LaunchReport
  const g = summarize(r.earlyBuys, r.totalSupply, r.creation.jitoTip)
  const out: LaunchReport = { ...r, dev: { wallet: r.dev.wallet, ...g.dev }, summary: g.summary, checks: g.checks, grade: g.grade }
  writeFileSync(f, JSON.stringify(out, null, 2) + '\n')
  console.log(`${out.grade.padEnd(11)} ${r.mint}  dev-in-block-0=${out.dev.block0Buy}`)
}
