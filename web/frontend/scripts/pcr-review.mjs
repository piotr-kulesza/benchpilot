// pcr-review.mjs — every station of ONE bundled protocol at its start, middle and end
// (p = 0, 0.5, 1), rendered by the REAL runner (dev-only ?pin=<p>), tiled into one
// contact sheet: dev-shots/sheets/<protocol>_review.png.
//   node scripts/pcr-review.mjs [protocol=pcr]     (needs `npm run dev` on :4319)
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const proto = process.argv[2] || 'pcr'
// the middle is p = 0.54, not 0.5: a multi-reagent set-up (PCR 1, seven passes) is between
// passes at 0.5 — its pipette cruising above the frame; at 0.54 the middle pass dispenses
const PS = [0, 0.54, 1]
const OUT = path.join(process.cwd(), 'dev-shots', `${proto}_review`)
const SHEET = path.join(process.cwd(), 'dev-shots', 'sheets', `${proto}_review.png`)
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(path.dirname(SHEET), { recursive: true })

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
// contact sheet: one row per station, three columns (start · middle · end)
const imgs = tiles.map((t) => ({ ...t, b64: fs.readFileSync(t.file).toString('base64') }))
const html = `<html><body style="margin:0;background:#15181c;font:600 15px system-ui;color:#d8dde3">
<div style="padding:14px 18px;font-size:19px">${proto} — every station at start · middle · end (p = 0 · 0.54 · 1)</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 12px 12px">
${imgs.map((t) => `<div><div style="padding:4px 2px">station ${t.s} · p=${t.p}</div><img style="width:100%;display:block;border-radius:4px" src="data:image/png;base64,${t.b64}"></div>`).join('')}
</div></body></html>`
const sp = await browser.newPage()
await sp.setViewport({ width: 1800, height: 1000 })
await sp.setContent(html, { waitUntil: 'load' })
await sp.screenshot({ path: SHEET, fullPage: true })
await browser.close()
console.log('sheet →', SHEET)
