// Renders brand HTML/SVG files to PNG at exact pixel sizes using headless Chrome.
// usage: node brand/src/render.mjs <input.(svg|html)> <out.png> <width> <height>
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [, , input, out, w, h, transparent] = process.argv;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const url = pathToFileURL(path.resolve(input)).href;
if (input.endsWith('.svg')) {
  const fs = await import('node:fs');
  const tmp = path.resolve(input) + '.__render.html';
  fs.writeFileSync(tmp, `<html><body style="margin:0;background:transparent"><img src="${url}" style="width:${w}px;height:${h}px;display:block"></body></html>`);
  await page.goto(pathToFileURL(tmp).href);
  fs.unlinkSync(tmp);
} else {
  await page.goto(url);
}
await page.waitForTimeout(400);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, omitBackground: transparent === 't' });
await browser.close();
console.log('wrote', out);
