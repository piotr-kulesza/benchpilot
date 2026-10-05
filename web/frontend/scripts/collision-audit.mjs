// collision-audit.mjs — COLLISIONS AT CURRENT SIZES, on the live runner (dev server):
// for every station of every bundled protocol, the step is run frame by frame (the
// station entered with the runner's own Next button, so the sample arrives as a viewer
// sees it), and src/dev/collisionAudit.js reports
//   intersect — solids crossing (tube through rack, tip through wall, lid through body)
//   float / sunk — an object at rest touching nothing / below the bench top
//   sweep — a moving object passing through a surface between two frames
// Deterministic (seeded per station, fixed-step clock: scripts/lib/determinism.mjs).
//
//   node scripts/collision-audit.mjs [--protocols a,b] [--only proto:station,...] [--out file.json]
// Needs the VITE DEV server on $BASE (it imports src/dev/collisionDriver.js in the page).
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { deterministic } from './lib/determinism.mjs'
import { partitionSteps, timerSeconds } from '../src/lib/runtime.js'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const PROTOCOLS = flag('protocols', 'all')
const ONLY = flag('only', '') ? flag('only', '').split(',').map((x) => { const [p, s] = x.split(':'); return { p, s: Number(s) } }) : null
const OUT = flag('out', path.join(process.cwd(), 'dev-shots', 'collisions.json'))
// --snap proto:station:frame[,...] — pose the station at that simulated frame and save the
// runner's canvas (evidence for a finding): dev-shots/collisions/<proto>_<station>_f<frame>.png
const SNAPS = flag('snap', '') ? flag('snap', '').split(',').map((x) => { const [p, s, f] = x.split(':'); return { p, s: Number(s), f: Number(f) } }) : null
const SNAP_DIR = flag('snapdir', path.join(process.cwd(), 'dev-shots', 'collisions'))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const index = await page.evaluate(async () => (await fetch('protocols/index.json')).json())
const SEL = ONLY || SNAPS
const protos = index.filter((p) => (PROTOCOLS === 'all' || PROTOCOLS.split(',').includes(p.id)) && (!SEL || SEL.some((o) => o.p === p.id)))

const results = []
for (const p of protos) {
  const data = await page.evaluate(async (id) => (await fetch(`protocols/${id}.json`)).json(), p.id)
  const sess = await page.evaluateOnNewDocument((d, label) => {
    sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: label, lang: 'en', answers: {} }))
  }, data, p.id)
  const stations = partitionSteps(data.steps || []).stations
  for (let s = 1; s <= stations.length; s++) {
    if (SEL && !SEL.some((o) => o.p === p.id && o.s === s)) continue
    const det = await deterministic(page, `collision/${p.id}/${s}`, 3000)
    await page.goto(`${BASE}/?run=1&step=${Math.max(1, s - 1)}`, { waitUntil: 'networkidle0' })
    await det.settled()
    const ready = await page.evaluate(() => !!window.__benchLine)
    if (!ready) throw new Error('no window.__benchLine — is this the DEV server on the polish branch?')
    if (s > 1) {
      // enter the station with the runner's own Next (the sample glides in from the last one)
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /^Next/.test(x.textContent.trim()))
        if (!b) return false
        b.click(); return true
      })
      if (!clicked) throw new Error(`no Next button at ${p.id} station ${s - 1}`)
      await new Promise((r) => setTimeout(r, 400))   // React commits the step change
    }
    const st = stations[s - 1]
    // a timed step rests at p = 0 until Start: audit that rest too (4 s — the arrival glide
    // settles in ~2.2 s, then it is at rest)
    const timed = timerSeconds(st) > 0   // the runner's own rule for a countdown
    if (SNAPS) {
      // one page load per snapshot: pose the step at that frame, render, save the canvas
      for (const sn of SNAPS.filter((o) => o.p === p.id && o.s === s)) {
        if (sn !== SNAPS.filter((o) => o.p === p.id && o.s === s)[0]) {
          const d2 = await deterministic(page, `collision/${p.id}/${s}`, 3000)
          await page.goto(`${BASE}/?run=1&step=${Math.max(1, s - 1)}`, { waitUntil: 'networkidle0' }); await d2.settled()
          if (s > 1) { await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Next/.test(x.textContent.trim())).click()); await new Promise((r) => setTimeout(r, 400)) }
          await d2.dispose()
        }
        await page.evaluate(async (hold, f) => {
          const d = await import('/src/dev/collisionDriver.js')
          d.simulateStation(window.__benchLine, { hold, stopAt: f, every: 1e9 })
          window.__benchLine.render()
        }, timed ? 4 : 0, sn.f)
        fs.mkdirSync(SNAP_DIR, { recursive: true })
        const box = await page.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
        const file = path.join(SNAP_DIR, `${p.id}_${String(s).padStart(2, '0')}_f${sn.f}.png`)
        await page.screenshot({ path: file, clip: box })
        console.log('  snap', file)
      }
      await det.dispose()
      continue
    }
    const defects = await page.evaluate(async (hold) => {
      const d = await import('/src/dev/collisionDriver.js')
      return d.simulateStation(window.__benchLine, { hold })
    }, timed ? 4 : 0)
    results.push({ protocol: p.id, station: s, action: st.action, container: st.container, timed, defects })
    const red = defects.filter((d) => d.check)
    console.log(`${p.id} ${String(s).padStart(2)} ${(st.action || '?').padEnd(14)} ${red.length ? red.map((d) => `${d.check}:${d.a}×${d.b}=${d.depth.toFixed(3)}`).join('  ') : '✓'}`)
    await det.dispose()
  }
  await page.removeScriptToEvaluateOnNewDocument(sess.identifier)
}
await browser.close()
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(results, null, 1))
const counts = {}
for (const r of results) for (const d of r.defects) counts[d.check] = (counts[d.check] || 0) + 1
const n = results.filter((r) => r.defects.length).length
console.log(`\ncollision audit — ${results.length} stations, ${n} red · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'} → ${OUT}`)
if (errors.length) console.log(`page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`)
process.exitCode = n ? 1 : 0
