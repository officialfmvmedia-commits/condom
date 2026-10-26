// Screenshots every page at desktop (1440) and mobile (390) with headless Chromium.
// usage: node scripts/screenshots.mjs <baseUrl> <outDir> [tokenMint]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const [, , base = 'http://localhost:4173', out = 'screenshots', mint = 'So11111111111111111111111111111111111111112'] = process.argv
mkdirSync(out, { recursive: true })
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const pages = [
  { name: 'home', path: '/' },
  { name: 'launch', path: '/launch' },
  { name: 'launch-filled', path: '/launch', fill: true },
  { name: 'token', path: `/token/${mint}` },
  { name: 'rules', path: '/rules' },
]
const viewports = [
  { tag: 'desktop', width: 1440, height: 900, dpr: 1 },
  { tag: 'mobile', width: 390, height: 844, dpr: 2 },
]

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const errors = []
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: vp.tag === 'mobile', hasTouch: vp.tag === 'mobile' })
  for (const p of pages) {
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${p.name}/${vp.tag}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && errors.push(`${p.name}/${vp.tag} console: ${m.text()}`))
    await page.goto(base + p.path, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    if (p.fill) {
      await page.fill('input[placeholder="Better Coin"]', 'Better Coin')
      await page.fill('input[placeholder="BETTER"]', 'BETTER')
      await page.fill('textarea', 'Born protected. Dev buy capped, block zero named.')
      await page.locator('input[type=range]').fill('0.3')
    }
    // trigger scroll reveals, then return to top
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(1200)
    const file = `${out}/${p.name}-${vp.tag}.png`
    if (vp.tag === 'mobile') {
      await page.screenshot({ path: `${out}/${p.name}-${vp.tag}-fold.png` })
      await page.addStyleTag({ content: '.tabbar{display:none!important}' })
    }
    await page.screenshot({ path: file, fullPage: true })
    console.log('wrote', file)
    if (p.fill) {
      await page.click('button[type=submit]')
      await page.waitForTimeout(700)
      await page.screenshot({ path: `${out}/wallet-modal-${vp.tag}.png` })
      console.log('wrote', `${out}/wallet-modal-${vp.tag}.png`)
    }
    await page.close()
  }
  await ctx.close()
}
await browser.close()
if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '))
