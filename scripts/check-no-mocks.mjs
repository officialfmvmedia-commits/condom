// Fails the build if any dev-only mock code made it into dist/.
// Run automatically after `vite build` (see package.json "build").
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const FORBIDDEN = ['__CONDOM_DEV_MOCK__', 'createMockBackend', 'Mock Alpha', 'dev-mock', 'DEV MOCK DATA']

const files = []
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p) })
walk(DIST)

const hits = []
for (const f of files.filter((f) => /\.(js|css|html|map)$/.test(f))) {
  const src = readFileSync(f, 'utf8')
  for (const s of FORBIDDEN) if (src.includes(s)) hits.push(`${f.replace(DIST, 'dist/')}: contains "${s}"`)
}
if (hits.length) {
  console.error('\n✕ check-no-mocks: dev mock code found in production bundle:\n  ' + hits.join('\n  '))
  process.exit(1)
}
console.log(`✓ check-no-mocks: ${files.length} files in dist/, no dev mocks bundled.`)
