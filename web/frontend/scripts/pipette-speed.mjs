// pipette-speed.mjs — THE PIPETTE IS NEVER FASTER THAN ITS DESCENT, AND NEVER JUMPS.
//
// Plays the BUILT app like a user (a PROBE build: VITE_BENCH_PROBE=1 exposes window.__benchLine)
// through a whole protocol: each step runs to its end, a timed step is started and its countdown
// waited out (the clock jumps over the protocol time — nothing pipettes during it), Next. Every
// frame, every pipette that can be seen (its station faded in) is recorded in the world: position,
// speed, its station, the active station, the pass phase (pipetteRun's own label).
//
// Reference: the pipette's DESCENT into the vessel (phase 'descent') — its peak speed in that
// station. Red: any frame faster than 1.1 × it (listed as segments: station, phase, peak, how
// long), or a TELEPORT (an isolated one-frame jump, or a pipette that reappears elsewhere).
//
//   VITE_BENCH_PROBE=1 npx vite build --outDir dist-probe && npx vite preview --outDir dist-probe --port 4322
//   BASE=http://localhost:4322 node scripts/pipette-speed.mjs [--protocol neutrophil_rna] [--to 26] [--out f.json]
//   … --to 8 --video docs/x.webm      (frame-stepped capture at 30 fps of stations 1..to)
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { partitionSteps, timerSeconds } from '../src/lib/runtime.js'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4322'
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const ID = flag('protocol', 'neutrophil_rna')
const OUT = flag('out', path.join(process.cwd(), 'dev-shots', 'pipette-speed.json'))
const VIDEO = flag('video', '')
const data = JSON.parse(fs.readFileSync(path.join('public/protocols', ID + '.json'), 'utf8'))
const stations = partitionSteps(data.steps).stations
const TO = Number(flag('to', stations.length))
const TOL = 1.1          // a pipette may move at most 10 % faster than its descent
const JUMP = 0.05        // world units in one frame, isolated → a teleport

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 0,
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
// ONE navigation (the session is set before the app's scripts run): a first load cut short by a
// second left a webfont 'loading' for ever, and the 3D waits for its label fonts
await page.evaluateOnNewDocument((d) => {
  sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: 'pipette-speed', lang: 'en', answers: {} }))
  // seeded randomness + a FRAME clock: performance.now moves 1/60 s per delivered frame (so a
  // frame is a frame, however long the machine takes to render it); __clockJump skips a countdown
  let a = 0x5eed
  Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  let now = 0
  performance.now = () => now
  window.__clockJump = (ms) => { now += ms }
  const realRAF = window.requestAnimationFrame.bind(window)
  let queue = [], id = 0, scheduled = false
  window.__bpFrames = 0; window.__bpFrameLimit = Infinity
  function tick() {
    scheduled = false
    if (window.__bpFrames >= window.__bpFrameLimit) return
    now += 1000 / 60; window.__bpFrames++
    const q = queue; queue = []
    for (const [, cb] of q) cb(now)
    if (queue.length && !scheduled) { scheduled = true; realRAF(tick) }
  }
  window.requestAnimationFrame = (cb) => { queue.push([++id, cb]); if (!scheduled) { scheduled = true; realRAF(tick) } return id }
  window.cancelAnimationFrame = (x) => { queue = queue.filter((q) => q[0] !== x) }
  window.__kick = () => window.requestAnimationFrame(() => {})
}, data)
// the first load can stall (WebGL context under load): reload, up to 3 tries
for (let tries = 1; ; tries++) {
  await page.goto(`${BASE}/?run=1&step=1`, { waitUntil: 'networkidle0' }).catch(() => {})
  const ok = await page.waitForFunction(() => window.__benchLine && window.__benchLine.stations && window.__benchLine.stations(), { timeout: 30000, polling: 100 }).then(() => true, () => false)
  if (ok) break
  if (tries >= 3) throw new Error('the runner never came up (window.__benchLine) — is this a VITE_BENCH_PROBE build?')
}

// the recorder: every frame, every pipette of a faded-in station, in the world
await page.evaluate(() => {
  const L = window.__benchLine, rec = window.__pipRec = []
  const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }
  L.onFrame = (dt) => {
    const sts = L.stations(); if (!sts) return
    const row = [window.__bpFrames, L.active(), +(window.__benchperf.p || 0).toFixed(4), +Math.min(dt, 0.05).toFixed(5)]
    sts.forEach((st, i) => {
      // every pipette of the station on its own (a P200 and a P1000), never only the active one
      for (const pp of st.pips ? Object.values(st.pips) : st.pip ? [st.pip] : []) {
        if (!(st.vis > 0.001) || !shown(pp)) continue
        pp.updateWorldMatrix(true, false)
        const e = pp.matrixWorld.elements
        row.push([i, +e[12].toFixed(4), +e[13].toFixed(4), +e[14].toFixed(4), pp.userData.phase || 'home', +st.vis.toFixed(3), pp.userData.kind || 'P200'])
      }
    })
    rec.push(row)
  }
})

const frames = () => page.evaluate(() => window.__bpFrames)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let shot = 0
const shotDir = VIDEO ? fs.mkdtempSync(path.join(os.tmpdir(), 'pipvid-')) : null
// advance n frames: free-running, or (video) two frames per captured image
async function run(n) {
  if (!VIDEO) {
    const target = (await frames()) + n
    await page.waitForFunction((t) => window.__bpFrames >= t, { polling: 20, timeout: 0 }, target)
    return
  }
  for (let k = 0; k < n; k += 2) {
    await page.evaluate(() => { window.__bpFrameLimit = window.__bpFrames + 2; window.__kick() })
    await page.waitForFunction(() => window.__bpFrames >= window.__bpFrameLimit, { polling: 5, timeout: 0 })
    await page.screenshot({ path: path.join(shotDir, `${String(shot++).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 82 })
  }
}
// run until the step's animation is done (p = 1), then `tail` more seconds
async function finishStep(tail = 1.5) {
  for (let guard = 0; guard < 400; guard++) {
    const p = await page.evaluate(() => window.__benchperf.p || 0)
    if (p >= 0.9999) break
    await run(30)
  }
  await run(Math.round(tail * 60))
}
const click = (re) => page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button')].find((x) => r.test(x.textContent.trim())); if (b) { b.click(); return true } return false }, re.source)

if (VIDEO) await page.evaluate(() => { window.__bpFrameLimit = window.__bpFrames })
const marks = []
for (let s = 1; s <= TO; s++) {
  marks.push({ station: s, frame: await frames() })
  await run(90)                                         // the viewer reads the step (and the sample arrives)
  const T = timerSeconds(stations[s - 1])
  if (T > 0) {
    await run(120)                                      // a timed step rests until Start
    if (await click(/Start/)) {
      await run(2)
      await page.evaluate((ms) => window.__clockJump(ms), T * 1000 + 100)   // the countdown: protocol time
    }
  }
  await finishStep()
  process.stdout.write(`\r  station ${s}/${TO}  frame ${await frames()}   `)
  if (s < TO) { await click(/^Next/); await sleep(150) }
}
await run(60)
const rec = await page.evaluate(() => window.__pipRec)
await browser.close()
process.stdout.write('\n')

if (VIDEO) {
  fs.mkdirSync(path.dirname(VIDEO), { recursive: true })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(shotDir, '%06d.jpg'),
    '-vf', 'scale=960:-2', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', VIDEO])
  fs.rmSync(shotDir, { recursive: true, force: true })
  console.log(`video → ${VIDEO} (${(fs.statSync(VIDEO).size / 1e6).toFixed(1)} MB, ${shot} frames)`)
}

// ── analysis ──
const { analyse } = await import('../src/dev/pipetteSpeed.js')
const res = analyse(rec, { tol: TOL, jump: JUMP, fps: 60, names: stations.map((x) => x.action) })
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify({ marks, ...res }, null, 1))
for (const st of res.stations) {
  const fast = res.fast.filter((f) => f.station === st.station), tp = res.teleports.filter((t) => t.station === st.station)
  console.log(`${String(st.station).padStart(2)} ${String(st.action).padEnd(14)} descent ${st.descent == null ? '   –' : st.descent.toFixed(2)} u/s  max ${st.max.toFixed(2)} u/s (${st.maxPhase})  ${fast.length || tp.length ? `✗ ${fast.length} fast, ${tp.length} jumps` : '✓'}`)
  for (const f of fast) console.log(`     fast  ${f.where.padEnd(16)} ${f.phases.join('+').padEnd(28)} peak ${f.peak.toFixed(2)} u/s = ×${f.ratio.toFixed(2)} descent  for ${f.seconds.toFixed(2)} s`)
  for (const t of tp) console.log(`     JUMP  ${t.kind.padEnd(16)} ${t.phase.padEnd(28)} ${t.dist.toFixed(3)} u in one frame`)
}
console.log(`\npipette speed — ${res.stations.length} pipettes · ${res.fast.length} fast segments · ${res.teleports.length} teleports · max ×${res.maxRatio.toFixed(2)} of its descent → ${OUT}`)
if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 3).join(' | '))
process.exitCode = res.fast.length || res.teleports.length ? 1 : 0
