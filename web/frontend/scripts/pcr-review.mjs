// pcr-review.mjs — every station of ONE bundled protocol at its start, middle and end
// (p = 0, 0.5, 1), rendered by the REAL runner (dev-only ?pin=<p>), tiled into one
// contact sheet: dev-shots/sheets/<protocol>_review.png.
//   node scripts/pcr-review.mjs [protocol=pcr] [--per N] [--name X]   (needs `npm run dev` on :4319)
// --per N splits a long protocol across sheets of N stations: <X>_review_1.png, _2, …
// (--name X: the sheet's name, default the protocol id)
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const argv = process.argv.slice(2)
const opt = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null }
const proto = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))) || 'pcr'
const PER = +(opt('per') || 0), NAME = opt('name') || proto
// the middle is p = 0.54, not 0.5: a multi-reagent set-up (PCR 1, seven passes) is between
// passes at 0.5 — its pipette cruising above the frame; at 0.54 the middle pass dispenses
const PS = [0, 0.54, 1]
const OUT = path.join(process.cwd(), 'dev-shots', `${proto}_review`)
const SHEETS = path.join(process.cwd(), 'dev-shots', 'sheets')
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHEETS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const data = await page.evaluate(async (p) => (await fetch(`protocols/${p}.json`)).json(), proto)
await page.evaluateOnNewDocument((d, label) => {
  sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: label, lang: 'en', answers: {} }))
}, data, proto)
// the stations the runner shows, in order (actionable steps)
const n = await page.evaluate(async (p) => (await (await fetch('protocols/index.json')).json()).find((m) => m.id === p).steps, proto)
const tiles = []
for (let s = 1; s <= n; s++) {
  for (const p of PS) {
    await page.goto(`${BASE}/?run=1&step=${s}&pin=${p}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 5200))
    const file = path.join(OUT, `step${String(s).padStart(2, '0')}_p${String(p).replace('.', '')}.png`)
    // the 3D panel only (the runner's right-hand canvas)
    const box = await page.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
    await page.screenshot({ path: file, clip: box })
    tiles.push({ file, s, p })
    console.log('  captured step', s, 'p', p)
  }
}
// contact sheets: one row per station, three columns (start · middle · end); all stations
// on one sheet, or PER stations a sheet
const imgs = tiles.map((t) => ({ ...t, b64: fs.readFileSync(t.file).toString('base64') }))
const groups = []
for (let a = 1; a <= n; a += PER || n) groups.push([a, Math.min(n, a + (PER || n) - 1)])
const sp = await browser.newPage()
await sp.setViewport({ width: 1800, height: 1000 })
for (let g = 0; g < groups.length; g++) {
  const [a, b] = groups[g]
  const part = imgs.filter((t) => t.s >= a && t.s <= b)
  const html = `<html><body style="margin:0;background:#15181c;font:600 15px system-ui;color:#d8dde3">
<div style="padding:14px 18px;font-size:19px">${proto} — stations ${a}–${b} of ${n} at start · middle · end (p = 0 · 0.54 · 1)</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 12px 12px">
${part.map((t) => `<div><div style="padding:4px 2px">station ${t.s} · p=${t.p}</div><img style="width:100%;display:block;border-radius:4px" src="data:image/png;base64,${t.b64}"></div>`).join('')}
</div></body></html>`
  const SHEET = path.join(SHEETS, groups.length > 1 ? `${NAME}_review_${g + 1}.png` : `${NAME}_review.png`)
  await sp.setContent(html, { waitUntil: 'load' })
  await sp.screenshot({ path: SHEET, fullPage: true })
  console.log('sheet →', SHEET)
}
await browser.close()
