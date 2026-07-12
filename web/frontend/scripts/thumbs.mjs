// Pre-render each example's hero-equipment model to a small PNG for the Home cards.
// Uses the ?models=1 dev route (the same models the runner shows). Output → public/thumbs.
//   node scripts/thumbs.mjs
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const OUT = path.join(process.cwd(), 'public', 'thumbs')
fs.mkdirSync(OUT, { recursive: true })

// example id → hero model id (kept in sync with src/components/heroThumbs.js)
const ITEMS = ['nanodrop', 'agar_plate', 'thermocycler', 'membrane', 'flask', 'well_plate', 'gel_rig', 'cryovial', 'staining_tray']

const W = 420, H = 264
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', `--window-size=${W + 40},${H + 80}`] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

for (const item of ITEMS) {
  await page.goto(`${BASE}/?models=1&bare=1&item=${item}&angle=front`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 900))
  await page.screenshot({ path: path.join(OUT, `${item}.png`) })
  console.log('  thumb', item)
}
await browser.close()
console.log('done')
