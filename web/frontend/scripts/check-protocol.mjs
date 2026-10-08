// check-protocol.mjs — ONE COMMAND to check any protocol: every rule on every station, red/green.
//
//   npm run check-protocol -- path/to/protocol.json [more.json …]
//   npm run check-protocol -- --examples                     (the bundled public/protocols)
//   npm run check-protocol -- --generated 50 [--seed 1]      (synthetic, src/dev/genProtocol.js)
//   … [--out report.json] [--stations 3,4] [--base http://localhost:4321 (an already running dev server)]
//
// It starts its own Vite dev server (the line's hooks, window.__benchLine, exist in dev builds),
// loads each protocol in the real runner, and plays it like a user — each step on the runner's own
// clock to its end, a timed one started and its countdown run (a long one: first and last 10 s),
// then Next — checking, every frame (src/dev/protocolCheck.js):
//   liquid (a–d) · speed of every object and the camera · teleports · collisions + motion audit ·
//   pipette capacity and choice (≤ 200 µl P200; 201–1000 µl one P1000 pass; more: P1000 passes).
// Exit 1 if any station is red.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { partitionSteps, timerSeconds } from '../src/lib/runtime.js'
import { buildLedger } from '../src/vessel/liquidLedger.js'
import { sampleContainerSequence } from '../src/vessel/sceneRecipe.js'
import { generateProtocol } from '../src/dev/genProtocol.js'
import { passesFor, comparePasses } from '../src/dev/protocolCheck.js'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const has = (n) => argv.includes(`--${n}`)
const OUT = flag('out', path.join(process.cwd(), 'dev-shots', 'check-protocol.json'))
const ONLY = flag('stations', '') ? flag('stations', '').split(',').map(Number) : null
const VERBOSE = has('verbose')
const STREAM = !has('quiet')   // each station as it is checked (a stall shows where it is)

// ── which protocols ──
const jobs = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) { if (['out', 'stations', 'base', 'generated', 'seed'].includes(a.slice(2))) i++; continue }
  jobs.push({ name: path.basename(a, '.json'), data: JSON.parse(fs.readFileSync(a, 'utf8')) })
}
if (has('examples')) {
  const dir = path.join('public', 'protocols')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort())
    jobs.push({ name: f.replace('.json', ''), data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) })
}
if (flag('generated', '')) {
  const n = Number(flag('generated')), s0 = Number(flag('seed', 1))
  for (let s = s0; s < s0 + n; s++) jobs.push({ name: `gen-${s}`, data: generateProtocol(s) })
}
if (!jobs.length) { console.log('usage: npm run check-protocol -- <protocol.json …> | --examples | --generated N [--seed S]'); process.exit(2) }

// ── a dev server ──
let BASE = flag('base', process.env.BASE || ''), server = null
if (!BASE) {
  const { createServer } = await import('vite')
  server = await createServer({ server: { port: 4340, strictPort: false }, logLevel: 'error' })
  await server.listen()
  BASE = server.resolvedUrls.local[0].replace(/\/$/, '')
}

// what the ledger says each station pipettes (expected passes, rule 1)
function expectedPasses(data) {
  const stations = partitionSteps(data.steps).stations
  const L = buildLedger(stations, { containers: sampleContainerSequence(stations) })
  // the vessels a station RETIRES (a used collection tube set aside, a mix used up): gone at the next
  // boundary, not a jump
  const retired = L.stations.map((rec) => rec.ops.filter((o) => o.op === 'retire').map((o) => o.from))
  return { stations, L, retired, expect: L.stations.map((rec) => [...rec.ops.flatMap((o) => {
    const piped = (o.op === 'add' || o.op === 'move' || o.op === 'discard') && o.method === 'pipette'
    return piped && !o.guess ? passesFor(o.ul) : []
  }), ...(rec.mixUl > 0 ? [0, 1, 2].flatMap(() => passesFor(rec.mixUl)) : [])]) }   // (mixing by pipetting: three strokes of what the ledger draws)
}

const launch = () => puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 0,
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })
let browser = await launch()
// warm the dev server: a fresh one optimises its dependencies on first use and RELOADS the page
{
  const p = await browser.newPage()
  await p.goto(`${BASE}/?run=1&step=1`, { waitUntil: 'networkidle0' }).catch(() => {})
  await p.evaluate(async () => { await import('/src/dev/protocolCheck.js'); await import('/src/dev/collisionDriver.js') }).catch(() => {})
  await new Promise((r) => setTimeout(r, 3000))
  await p.close()
}
const report = []
let redStations = 0, allStations = 0, redProtocols = 0
const t0 = Date.now()
async function runJob(job) {
  const { stations, expect, retired } = expectedPasses(job.data)
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // ONE navigation: the session and a frame clock are set before the app's own scripts run
  await page.evaluateOnNewDocument((d, trace) => {
    if (trace) window.__traceSpin = true
    sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: 'check-protocol', lang: 'en', answers: {} }))
    let a = 0x5eed
    Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    let now = 0
    performance.now = () => now
    // the wall clock too (a countdown's DONE is read from Date.now): on a slow check, real time ran out
    // before the frame clock did, and the countdown jumped to its end
    const t0 = Date.now(); Date.now = () => t0 + now
    window.__clockAdd = (ms) => { now += ms }
  }, job.data, has('trace-spin'))
  let ok = false
  for (let tries = 0; tries < 3 && !ok; tries++) {
    await page.goto(`${BASE}/?run=1&step=1`, { waitUntil: 'networkidle0' }).catch(() => {})
    ok = await page.waitForFunction(() => window.__benchLine && window.__benchLine.stations && window.__benchLine.stations(), { timeout: 30000, polling: 100 }).then(() => true, () => false)
  }
  const rows = []
  if (!ok) rows.push({ station: 0, red: ['the runner never came up'] })
  for (let s = 1; ok && s <= stations.length; s++) {
    let boundary = []
    if (s > 1) {
      const end = await page.evaluate(async () => (await import('/src/dev/protocolCheck.js')).sampleLiquids(window.__benchLine))
      const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Next/.test(x.textContent.trim())); if (b) b.click(); return !!b })
      if (!clicked) { rows.push({ station: s, red: ['no Next button'] }); break }
      await page.waitForFunction((i) => window.__benchLine.active() === i, { timeout: 10000, polling: 20 }, s - 1).catch(() => {})
      boundary = await page.evaluate(async (end, except) => {
        const P = await import('/src/dev/protocolCheck.js'), line = window.__benchLine
        line.hold = true; line.pForce = null; window.__clockAdd(1000 / 60); line.step(1 / 60)
        return P.checkBoundary(end, P.sampleLiquids(line), except)
      }, end, retired[s - 2] || [])
    }
    if (ONLY && !ONLY.includes(s)) {
      await page.evaluate(async () => { const d = await import('/src/dev/collisionDriver.js'); d.finishStation(window.__benchLine) })
      continue
    }
    const T = timerSeconds(stations[s - 1])
    let r
    try {
      r = await page.evaluate(async (T) => {
        const P = await import('/src/dev/protocolCheck.js')
        const startTimer = () => { const b = [...document.querySelectorAll('button')].find((x) => /Start/.test(x.textContent)); if (b) b.click() }
        const r = await P.checkStation(window.__benchLine, { timed: T, clockAdd: (ms) => window.__clockAdd(ms), startTimer })
        if (window.__spinTrace) { r.spinTrace = window.__spinTrace.filter((x, i) => i % 15 === 0); window.__spinTrace = [] }
        return r
      }, T)
    } catch (e) { r = { error: String(e.message || e).slice(0, 200) } }
    const exp = expect[s - 1] || []
    const passBad = r.pipette ? comparePasses(exp, r.pipette.passes) : []
    const red = []
    if (r.error) red.push(`error: ${r.error}`)
    if (r.unfinished != null) red.push(`did not finish (p ${r.unfinished})`)
    if (boundary.length) red.push(`liquid (d) ×${boundary.length}: ${boundary[0].vessel} ${boundary[0].detail}`)
    if (r.liquid && r.liquid.length) red.push(`liquid (${[...new Set(r.liquid.map((b) => b.check))].join(',')}) ×${r.liquid.length}: ${r.liquid[0].vessel} ${r.liquid[0].detail}`)
    if (r.speed && r.speed.length) { const w = r.speed.sort((a, b) => b.ratio - a.ratio)[0]; red.push(`speed ×${r.speed.length} objects: ${w.label} ${w.peak} u/s = ×${w.ratio} of the cap (frame ${w.peakFrame}, p ${w.peakP})`) }
    if (r.teleports && r.teleports.length) red.push(`teleport ×${r.teleports.length}: ${r.teleports[0].object} ${r.teleports[0].kind} ${r.teleports[0].dist}`)
    if (r.camera && (r.camera.over || r.camera.teleports.length)) red.push(`camera ${r.camera.over ? `×${r.camera.ratio} of its cap (frame ${r.camera.peakFrame})` : ''}${r.camera.teleports.length ? ` jump ${r.camera.teleports[0].dist}` : ''}`)
    if (r.collisions && r.collisions.length) red.push(`collision ×${r.collisions.length}: ${r.collisions.map((c) => `${c.check}:${c.a}×${c.b}=${(+c.depth).toFixed(3)}`).slice(0, 2).join('  ')}`)
    if (r.motionAudit && r.motionAudit.length) red.push(`motion ×${r.motionAudit.length}: ${r.motionAudit.map((c) => `${c.check}:${c.a}`).slice(0, 2).join('  ')}`)
    if (r.pipette && r.pipette.overCount) red.push(`capacity: a ${r.pipette.over[0].kind} tip held ${r.pipette.over[0].ul} µl`)
    if (passBad.length) red.push(`pipette: ${passBad.slice(0, 2).join('; ')}${passBad.length > 2 ? ` (+${passBad.length - 2})` : ''}`)
    if (STREAM) console.log(`    · ${job.name} ${String(s).padStart(2)} ${String(stations[s - 1].action).padEnd(14)} ${red.length ? '✗ ' + red.join(' | ').slice(0, 200) : '✓'}`)
    rows.push({ station: s, action: stations[s - 1].action, container: stations[s - 1].container, red, detail: VERBOSE ? r : { speedPeak: r.peak, camera: r.camera, passes: r.pipette && r.pipette.passes, expected: exp }, spinTrace: r.spinTrace })
  }
  await page.close()
  return { rows, errors }
}
for (const job of jobs) {
  let res
  for (let attempt = 1; ; attempt++) {
    try { res = await runJob(job); break } catch (e) {
      // the page was reloaded under the run (a dependency re-optimised), or the browser itself went
      // down (a GPU process lost): a fresh browser if need be, and the protocol again
      if (!browser.connected) { try { await browser.close() } catch { /* gone */ } browser = await launch() }
      if (attempt >= 3) { res = { rows: [{ station: 0, red: [`the run failed: ${String(e.message).slice(0, 120)}`] }], errors: [] }; break }
      console.log(`  (${job.name}: ${String(e.message).slice(0, 80)} — retrying)`)
    }
  }
  const { rows, errors } = res
  for (const row of rows) { if (row.station) allStations++; if (row.red && row.red.length) redStations++ }
  const nRed = rows.filter((x) => x.red && x.red.length).length
  if (nRed) redProtocols++
  report.push({ protocol: job.name, stations: rows.length, red: nRed, rows, pageErrors: [...new Set(errors)].slice(0, 3) })
  console.log(`\n${nRed ? '✗' : '✓'} ${job.name} — ${rows.length} stations, ${nRed} red`)
  for (const row of rows) console.log(`  ${row.red && row.red.length ? '✗' : '✓'} ${String(row.station).padStart(2)} ${String(row.action || '').padEnd(14)} ${String(row.container || '').padEnd(12)} ${(row.red || []).join(' | ')}`)
  if (errors.length) console.log('  page errors:', [...new Set(errors)].slice(0, 2).join(' | '))
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 1))
}
await browser.close()
if (server) await server.close()
console.log(`\ncheck-protocol — ${report.length} protocols (${redProtocols} red) · ${allStations} stations, ${redStations} red · ${((Date.now() - t0) / 60000).toFixed(1)} min → ${OUT}`)
process.exitCode = redStations ? 1 : 0
