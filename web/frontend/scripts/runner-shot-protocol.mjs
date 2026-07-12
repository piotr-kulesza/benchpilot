// Screenshot the runner on an ARBITRARY bundled protocol by preloading the session
// (the runner otherwise defaults to RNA). Used to check the camera fit on a wide gel
// rig, etc.  node scripts/runner-shot-protocol.mjs <protocol> <src label> <steps> <tag>
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const OUT = process.env.OUT || path.join(process.cwd(), 'dev-shots')
fs.mkdirSync(OUT, { recursive: true })

const proto = process.argv[2] || 'agarose_gel'
const steps = (process.argv[3] || '9').split(',')
const tag = process.argv[4] || proto
const settle = Number(process.argv[5] || 7600)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

// fetch the protocol JSON, seed sessionStorage before the app boots
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const data = await page.evaluate(async (p) => (await fetch(`protocols/${p}.json`)).json(), proto)
await page.evaluateOnNewDocument((d, label) => {
  sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: label, lang: 'en', answers: {} }))
}, data, proto)

for (const s of steps) {
  await page.goto(`${BASE}/?run=1&step=${s}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, settle))
  await page.screenshot({ path: `${OUT}/${tag}__step${s}.png` })
  console.log('  captured', proto, 'step', s)
}
await browser.close()
console.log('done')
