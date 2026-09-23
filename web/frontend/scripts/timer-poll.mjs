// Start a timed step and poll the countdown digits over the full duration to catch a
// stall.  node scripts/timer-poll.mjs <protocol|-> <step> <seconds>
import puppeteer from 'puppeteer-core'
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const proto = process.argv[2] || '-'
const step = process.argv[3] || '9'
const secs = Number(process.argv[4] || 17)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 850 })
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
await new Promise((r) => setTimeout(r, 1000))

// read the big timer digits
const readDigits = () => page.evaluate(() => {
  const el = document.querySelector('.timer-digits') || [...document.querySelectorAll('*')].find((n) => /^\d?\d:\d\d$/.test(n.textContent?.trim() || ''))
  return el ? el.textContent.trim() : '(none)'
})

const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /start/i.test(x.textContent)); if (b) { b.click(); return true } return false })
console.log('Start clicked:', clicked)

const t0 = Date.now()
let last = null
for (let i = 0; i < secs * 2; i++) {
  const d = await readDigits()
  const t = ((Date.now() - t0) / 1000).toFixed(1)
  if (d !== last) { console.log(`  t=${t}s  ${d}`); last = d }
  await new Promise((r) => setTimeout(r, 500))
}
await browser.close()
console.log('done')
