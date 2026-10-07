// tempo-ratio.mjs — every motion of every neutrophil station, timed at tempo 1 and at
// ANIMATION_TEMPO on the runner's OWN clock (no forced progress): each motion segment of the
// pipette (moves, descents, lifts, plunger…), the vessels, the column, lids and the centrifuge
// must take tempo × as long (± 5 %). src/dev/tempoProbe.js; proven red by tempoProbe.test.js.
//
//   node scripts/tempo-ratio.mjs [--protocol neutrophil_rna] [--only 2,5] [--out file.json]
// Needs the VITE DEV server on $BASE. A page clock is installed (performance.now moves only when
// the script steps a frame), so a timed step's countdown runs on the same frames; the countdown's
// own protocol time is NOT animation and is skipped (rest before Start, then the end after it).
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { partitionSteps, timerSeconds } from '../src/lib/runtime.js'
import { compareRuns } from '../src/dev/tempoProbe.js'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const ID = flag('protocol', 'neutrophil_rna')
const ONLY = flag('only', '') ? flag('only', '').split(',').map(Number) : null
const OUT = flag('out', path.join(process.cwd(), 'dev-shots', 'tempo-ratio.json'))
const HZ = Number(flag('hz', 240))   // sampling rate: a trigger between frames shifts a 0.1 s motion by 8 % at 60 Hz, 2 % at 240
const SLOW = Number(flag('tempo', (await import('../src/scene/tempo.js').catch(() => ({ ANIMATION_TEMPO: 1.6 }))).ANIMATION_TEMPO))

const data = JSON.parse(fs.readFileSync(path.join('public/protocols', ID + '.json'), 'utf8'))
const stations = partitionSteps(data.steps).stations

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 0,
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })

async function run(s, tempo) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluateOnNewDocument((d, T) => {
    sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: 'tempo-ratio', lang: 'en', answers: {} }))
    window.__benchTempo = T
    let now = 0; performance.now = () => now; window.__clockAdd = (ms) => { now += ms }
  }, data, tempo)
  await page.goto(`${BASE}/?run=1&step=${Math.max(1, s - 1)}`, { waitUntil: 'networkidle0' }).catch(() => {})
  await page.waitForFunction(() => window.__benchLine && window.__benchLine.stations && window.__benchLine.stations(), { timeout: 60000, polling: 100 })
  await new Promise((r) => setTimeout(r, 500))
  if (s > 1) {
    await page.evaluate(async () => { const d = await import('/src/dev/collisionDriver.js'); d.finishStation(window.__benchLine) })
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Next/.test(x.textContent.trim())).click())
    await new Promise((r) => setTimeout(r, 400))
  }
  const timed = timerSeconds(stations[s - 1])
  const segs = await page.evaluate(async (tempo, timed, HZ) => {
    const P = await import('/src/dev/tempoProbe.js')
    const line = window.__benchLine, st = line.stations()[line.active()]
    const tick = () => window.__clockAdd(1000 / HZ), dt = 1 / HZ
    const F = (sec) => Math.round(sec * tempo * HZ)
    const track = new Map()
    if (!timed) {
      P.recordLine(line, { frames: F((st.duration || 6.5) + 4), dt, tick, track })
    } else {
      P.recordLine(line, { frames: F(5), dt, tick, track })                      // the rest before Start
      const b = [...document.querySelectorAll('button')].find((x) => /Start/.test(x.textContent))
      if (b) {
        b.click(); await new Promise((r) => setTimeout(r, 200))
        window.__clockAdd(timed * 1000 + 50); line.step(dt)              // the countdown (protocol time)
        P.recordLine(line, { frames: F(5), dt, tick, track })                    // its end: spin-down, lid, …
      }
    }
    return P.finish(track)
  }, tempo, timed, HZ)
  await page.close()
  return segs
}

const results = []
let red = 0
for (let s = 1; s <= stations.length; s++) {
  if (ONLY && !ONLY.includes(s)) continue
  const a = await run(s, 1), b = await run(s, SLOW)
  const { rows, bad } = compareRuns(a, b, SLOW)
  results.push({ station: s, action: stations[s - 1].action, rows })
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(results, null, 1))
  if (bad.length) red++
  console.log(`${String(s).padStart(2)} ${stations[s - 1].action.padEnd(14)} ${rows.length} segments  ${bad.length ? `✗ ${bad.length}` : '✓'}`)
  for (const r of rows) console.log(`     ${r.ok ? '✓' : '✗'} ${r.path.slice(0, 60).padEnd(60)} #${String(r.i).padEnd(2)} at ${r.start1 == null ? '  –' : (r.start1 / HZ).toFixed(2).padStart(5)} s  ${r.f1 == null ? '   –' : (r.f1 / HZ).toFixed(3)} s → ${r.fT == null ? '   –' : (r.fT / HZ).toFixed(3)} s  ${r.instant ? 'instant (no duration)' : r.ratio == null ? '' : '×' + r.ratio.toFixed(3)} ${r.why}`)
}
await browser.close()
const all = results.flatMap((r) => r.rows)
console.log(`\ntempo ratio ×${SLOW} — ${results.length} stations, ${red} red · ${all.length} segments, ${all.filter((r) => !r.ok).length} off → ${OUT}`)
process.exitCode = red ? 1 : 0
