// station-motion.mjs — what ONE station shows in motion, in the REAL runner: its timeline
// pinned at p = 0, 0.1 … 1 (dev-only ?pin=<p>), and the step changes INTO and OUT OF it as a
// user makes them (the runner's own Next button; frames every 0.25 s over the camera glide).
// One contact sheet: dev-shots/sheets/<protocol>_station<N>_motion.png
//   node scripts/station-motion.mjs <protocol> <station>      (needs `npm run dev` on :4319)
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const proto = process.argv[2] || 'neutrophil_rna'
const N = +(process.argv[3] || 1)
const OUT = path.join(process.cwd(), 'dev-shots', `${proto}_station${N}_motion`)
const SHEET = path.join(process.cwd(), 'dev-shots', 'sheets', `${proto}_station${N}_motion.png`)
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  const box = await page.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  const file = path.join(OUT, name + '.png'); await page.screenshot({ path: file, clip: box }); return file
}
const next = () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Next/.test(x.textContent.trim())); if (b) b.click(); return !!b })
const rows = []
// 1 · the station's own timeline, pinned
const seq = []
for (let k = 0; k <= 10; k++) {
  const p = k / 10
  await page.goto(`${BASE}/?run=1&step=${N}&pin=${p}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
  await sleep(4500)
  seq.push({ file: await shot(`p${String(k).padStart(2, '0')}`), label: `station ${N} · p=${p}` })
}
rows.push({ title: `station ${N} — its timeline, p = 0 … 1`, tiles: seq })
// 2 · the step changes into it and out of it, as a user makes them (Next), unpinned
for (const [from, to] of [[N - 1, N], [N, N + 1]]) {
  if (from < 1) continue
  await page.goto(`${BASE}/?run=1&step=${from}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
  await sleep(4500)
  const tiles = [{ file: await shot(`t${from}-${to}_before`), label: `${from} (before Next)` }]
  if (!(await next())) { console.log('  no Next button'); continue }
  for (let k = 1; k <= 10; k++) { await sleep(250); tiles.push({ file: await shot(`t${from}-${to}_${k}`), label: `${from}→${to} +${(k * 0.25).toFixed(2)} s` }) }
  await sleep(2500); tiles.push({ file: await shot(`t${from}-${to}_after`), label: `${to} (settled)` })
  rows.push({ title: `transition ${from} → ${to} (Next)`, tiles })
}
const b64 = (f) => fs.readFileSync(f).toString('base64')
const html = `<html><body style="margin:0;background:#15181c;font:600 14px system-ui;color:#d8dde3">
<div style="padding:14px 18px;font-size:19px">${proto} — station ${N} in motion</div>
${rows.map((r) => `<div style="padding:8px 18px 4px;font-size:16px">${r.title}</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 12px 12px">
${r.tiles.map((t) => `<div><div style="padding:4px 2px">${t.label}</div><img style="width:100%;display:block;border-radius:4px" src="data:image/png;base64,${b64(t.file)}"></div>`).join('')}
</div>`).join('')}</body></html>`
const sp = await browser.newPage()
await sp.setViewport({ width: 1800, height: 1000 })
await sp.setContent(html, { waitUntil: 'load' })
await sp.screenshot({ path: SHEET, fullPage: true })
await browser.close()
console.log('sheet →', SHEET)
