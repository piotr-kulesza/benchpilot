// liquid-frames.mjs — THE LIQUID INVARIANT on the live runner, every frame of every station
// (src/dev/liquidFrames.js): a volume changes only during a transfer (a: tip below the surface /
// in the target with the plunger moving, a turning rotor, a connecting stream), a colour only while
// liquid flows in (b), vessels + tip conserved every frame (c), no jump at a station boundary (d).
// Exits 1 on any violation.
//
//   node scripts/liquid-frames.mjs [--protocol neutrophil_rna] [--only 2,5] [--out file.json]
//   node scripts/liquid-frames.mjs --snap 5:120,9:300 --snapdir dev-shots/liquid-frames/before
// Needs the VITE DEV server on $BASE (window.__benchLine). Deterministic (fixed-step clock).
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { deterministic } from './lib/determinism.mjs'
import { partitionSteps, timerSeconds } from '../src/lib/runtime.js'
import { buildLedger } from '../src/vessel/liquidLedger.js'
import { sampleContainerSequence } from '../src/vessel/sceneRecipe.js'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const ID = flag('protocol', 'neutrophil_rna')
const ONLY = flag('only', '') ? flag('only', '').split(',').map(Number) : null
const OUT = flag('out', path.join(process.cwd(), 'dev-shots', 'liquid-frames.json'))
const SNAPS = flag('snap', '') ? flag('snap', '').split(',').map((x) => { const [s, f] = x.split(':'); return { s: Number(s), f: Number(f) } }) : null
const SNAP_DIR = flag('snapdir', path.join(process.cwd(), 'dev-shots', 'liquid-frames'))

const data = JSON.parse(fs.readFileSync(path.join('public/protocols', ID + '.json'), 'utf8'))
const stations = partitionSteps(data.steps).stations
const ledger = buildLedger(stations, { containers: sampleContainerSequence(stations) })
// a vessel REPLACED at a boundary (the used collection tube set aside) is not a jump
const replaced = (n) => (ledger.stations[n - 1] && ledger.stations[n - 1].ops.some((o) => o.op === 'retire' && o.from === 'flow') ? ['flow'] : [])

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 0,
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.evaluateOnNewDocument((d) => {
  sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: 'liquid-frames', lang: 'en', answers: {} }))
}, data)
const goto = (url) => page.goto(url, { waitUntil: 'networkidle0' }).catch(() => page.goto(url, { waitUntil: 'load', timeout: 60000 }))

// load the runner on station s−1, finish it, sample its end, press Next, sample the start of s
async function enter(s) {
  const det = await deterministic(page, `liquid-frames/${ID}/${s}`, 3000)
  await goto(`${BASE}/?run=1&step=${Math.max(1, s - 1)}`)
  await det.settled()
  let boundary = []
  if (s > 1) {
    const end = await page.evaluate(async () => {
      const d = await import('/src/dev/collisionDriver.js'); d.finishStation(window.__benchLine)
      const L = await import('/src/dev/liquidFrames.js'); return L.sampleLiquids(window.__benchLine)
    })
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Next/.test(x.textContent.trim())).click())
    await new Promise((r) => setTimeout(r, 400))
    boundary = await page.evaluate(async (end, except) => {
      const L = await import('/src/dev/liquidFrames.js'); const line = window.__benchLine
      line.hold = true; line.pForce = 0; line.step(1 / 60)
      return L.checkBoundary(end, L.sampleLiquids(line), except)
    }, end, replaced(s - 1))
  }
  return { det, boundary }
}

const results = []
for (let s = 1; s <= stations.length; s++) {
  if (ONLY && !ONLY.includes(s)) continue
  if (SNAPS && !SNAPS.some((o) => o.s === s)) continue
  const timed = timerSeconds(stations[s - 1]) > 0
  if (SNAPS) {
    for (const sn of SNAPS.filter((o) => o.s === s)) {
      const { det } = await enter(s)
      const got = await page.evaluate(async (hold, f) => {
        const L = await import('/src/dev/liquidFrames.js')
        return L.runStation(window.__benchLine, { hold, stopAt: f })
      }, timed ? 4 : 0, sn.f)
      await page.evaluate(() => { window.__bpFrameLimit = window.__bpFrames + 2; requestAnimationFrame(() => {}) })
      await page.waitForFunction(() => window.__bpFrames >= window.__bpFrameLimit, { polling: 30 })
      await new Promise((r) => setTimeout(r, 100))
      fs.mkdirSync(SNAP_DIR, { recursive: true })
      const box = await page.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
      const file = path.join(SNAP_DIR, `${String(s).padStart(2, '0')}_f${sn.f}.png`)
      await page.screenshot({ path: file, clip: box })
      fs.writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify(got.frame, null, 1))
      console.log('  snap', file)
      await det.dispose()
    }
    continue
  }
  const { det, boundary } = await enter(s)
  const r = await page.evaluate(async (hold) => {
    const L = await import('/src/dev/liquidFrames.js')
    return L.runStation(window.__benchLine, { hold })
  }, timed ? 4 : 0)
  const bad = [...boundary, ...r.bad]
  results.push({ station: s, step: stations[s - 1].index, action: stations[s - 1].action, nFrames: r.nFrames, dur: r.dur, bad, frames: r.frames })
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(results, null, 1))
  const by = {}; for (const b of bad) by[b.check] = (by[b.check] || 0) + 1
  const first = (c) => { const x = bad.filter((b) => b.check === c); return x.length ? `${c}: ${x.length} (frames ${[...new Set(x.map((b) => b.frame))].slice(0, 4).join(', ')}${x.length > 4 ? '…' : ''}; ${x[0].vessel} ${x[0].detail})` : '' }
  console.log(`${String(s).padStart(2)} ${stations[s - 1].action.padEnd(14)} ${r.nFrames} frames  ${bad.length ? ['d', 'a', 'b', 'c'].map(first).filter(Boolean).join('  ') : '✓'}`)
  await det.dispose()
}
await browser.close()
if (!SNAPS) {
  const n = results.filter((r) => r.bad.length).length, tot = {}
  for (const r of results) for (const b of r.bad) tot[b.check] = (tot[b.check] || 0) + 1
  console.log(`\nliquid frames — ${results.length} stations, ${n} red · ${Object.entries(tot).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'} → ${OUT}`)
  if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 5).join(' | '))
  process.exitCode = n ? 1 : 0
}
