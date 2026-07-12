// Screenshot the REAL runner (?run=1&step=N) at 1440×900 — the frame the Stage-13
// prompt judged from. Camera-fit + chrome clipping only show in the real app, not
// the fixed-camera matrix harness.
//   node scripts/runner-shot.mjs 8,20 [tag] [settleMs]
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const OUT = process.env.OUT || path.join(process.cwd(), 'dev-shots')
fs.mkdirSync(OUT, { recursive: true })

const steps = (process.argv[2] || '8,20').split(',')
const tag = process.argv[3] || 'run'
const settle = Number(process.argv[4] || 7600) // let the p-timeline reach ~1 and hold

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
page.on('console', (m) => { const t = m.text(); if (/benchpilot|Error|warn/i.test(t)) console.log('  [console]', t) })

for (const s of steps) {
  await page.goto(`${BASE}/?run=1&step=${s}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, settle))
  await page.screenshot({ path: `${OUT}/${tag}__step${s}.png` })
  console.log('  captured step', s)
}
await browser.close()
console.log('done')
