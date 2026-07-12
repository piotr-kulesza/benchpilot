// Headless capture driver for the dev harness routes (?models=1, ?matrix=1).
// Renders each target and writes PNGs so a human/agent can LOOK at the result —
// the whole point of Stage 10 is judging renders, never build output.
//
//   node scripts/dev-shots.mjs gallery [id,id,...] [front,top]
//   node scripts/dev-shots.mjs matrix  [action:container[:from], ...] [p0,p1,...]
//
// Needs a preview/dev server on $BASE (default http://localhost:4319) and Chrome.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const OUT = process.env.OUT || path.join(process.cwd(), 'dev-shots')
fs.mkdirSync(OUT, { recursive: true })

const MODEL_IDS = ['microtube','spin_column','eluate_tube','cryovial','well_plate','flask','dish','slide','membrane','gel','agar_plate',
  'centrifuge','cold_block','water_bath','thermocycler','gel_rig','freezer','staining_tray','spreader','nanodrop','bottle','pipette','pipette_stand','ice_bucket','waste','syringe']

const mode = process.argv[2] || 'gallery'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1100,850'] })
const page = await browser.newPage()
await page.setViewport({ width: 1100, height: 850 })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

if (mode === 'gallery') {
  const ids = process.argv[3] ? process.argv[3].split(',') : MODEL_IDS
  const angles = process.argv[4] ? process.argv[4].split(',') : ['front', 'top']
  for (const id of ids) {
    for (const angle of angles) {
      await page.goto(`${BASE}/?models=1&item=${id}&angle=${angle}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 700))
      await page.screenshot({ path: `${OUT}/${id}__${angle}.png` })
    }
    console.log('  captured', id)
  }
} else if (mode === 'matrix') {
  // targets like "pour_add:well_plate" or "seed:flask:microtube" (from→to)
  const cells = (process.argv[3] || 'pour_add:microtube').split(',')
  const ps = (process.argv[4] || '0,0.25,0.5,0.75,1').split(',').map(Number)
  for (const cell of cells) {
    const [action, container, from] = cell.split(':')
    for (const p of ps) {
      const qs = new URLSearchParams({ matrix: '1', action, container, p: String(p) })
      if (from) qs.set('from', from)
      if (from) qs.set('to', container)
      await page.goto(`${BASE}/?${qs}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 350))
      const tag = `${action}__${from ? from + '-' : ''}${container}__p${String(p).replace('.', '')}`
      await page.screenshot({ path: `${OUT}/${tag}.png` })
    }
    console.log('  captured', cell)
  }
}
await browser.close()
console.log('done')
