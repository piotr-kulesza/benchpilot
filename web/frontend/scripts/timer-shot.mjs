// Drive the REAL countdown and capture the bench progress dial as it fills. Loads a
// timed step, clicks Start, and screenshots at wall-clock offsets so the ring is caught
// at ~10/50/95% of a short (15 s) timer.
//   node scripts/timer-shot.mjs <protocol|-> <step> <tag> <offsetsMs csv>
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const OUT = process.env.OUT || path.join(process.cwd(), 'dev-shots')
fs.mkdirSync(OUT, { recursive: true })

const proto = process.argv[2] || '-'          // '-' = default RNA
const step = process.argv[3] || '9'
const tag = process.argv[4] || 'timer'
const offsets = (process.argv[5] || '1500,7500,14000').split(',').map(Number)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

if (proto !== '-') {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const data = await page.evaluate(async (p) => (await fetch(`protocols/${p}.json`)).json(), proto)
  await page.evaluateOnNewDocument((d, label) => {
    sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: label, lang: 'en', answers: {} }))
  }, data, proto)
}

await page.goto(`${BASE}/?run=1&step=${step}`, { waitUntil: 'networkidle0' })
await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
await new Promise((r) => setTimeout(r, 1200)) // let the scene settle

// click the timer's Start button (find by text)
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /start/i.test(b.textContent))
  if (btn) { btn.click(); return true }
  return false
})
console.log('  Start clicked:', clicked)

const pauseAt = process.argv[6] ? Number(process.argv[6]) : null // ms offset to click Pause
let paused = false
const t0 = Date.now()
for (const off of offsets) {
  if (pauseAt != null && !paused && off >= pauseAt) {
    const w = Math.max(0, pauseAt - (Date.now() - t0)); if (w > 0) await new Promise((r) => setTimeout(r, w))
    const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /pause/i.test(x.textContent)); if (b) { b.click(); return true } return false })
    paused = true; console.log('  Pause clicked:', ok)
  }
  const wait = Math.max(0, off - (Date.now() - t0))
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  await page.screenshot({ path: `${OUT}/${tag}__t${off}.png` })
  console.log('  captured at', secs, 's')
}
await browser.close()
console.log('done')
