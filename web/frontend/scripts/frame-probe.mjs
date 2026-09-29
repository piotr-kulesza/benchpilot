// frame-probe.mjs — measure what a step animation costs, per station, in the real runner.
//
// Run it against the PRODUCTION build (dev has HMR and StrictMode double-invocation):
//   npm run build && npx vite preview --port 4330 --strictPort
//   BASE=http://localhost:4330 node scripts/frame-probe.mjs                 # all protocols, every station
//   BASE=… node scripts/frame-probe.mjs --only neutrophil_rna:5,pcr:3 --set B --perf B
//
// For each station it records, over the step's animation window (the station is entered
// with the runner's own Next button, exactly as a user does; a timed step's Start is
// pressed):
//   - frame times (rAF deltas): median, p95, frames over 33 ms (a dropped frame at 30 fps)
//   - stale frames: frames where the step's animation value p did NOT advance while the
//     step was mid-animation (motion that stutters although frames are on time)
//   - renderer.info (window.__benchperf): draw calls, triangles, geometries, textures,
//     programs — sampled at the START and END of the window; a count that rises while a
//     step animates means something is created per frame and not disposed
//   - React commits during the window, per renderer (react-dom vs the R3F reconciler),
//     counted through the DevTools global hook, which fires in production builds too
// Output: dev-shots/perf/frames-<set>.json and frames-<set>.txt (sorted by p95).
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { partitionSteps } from '../src/lib/runtime.js'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const SET = flag('set', 'baseline')
// --perf X passes ?perf=X to the app. The A-D hooks it drove (shadow map, ref-driven clock,
// the stall control) were TEMPORARY and are not in the tree, so today it is inert; re-add a
// hook to measure a candidate fix.
const PERF = flag('perf', '')
const REPEAT = Number(flag('repeat', '1'))  // --only mode: measure each station this many times
const WINDOW = Number(flag('window', '7000'))   // the 6.5 s step animation + the dolly
const PROTOCOLS = flag('protocols', 'all')
// --only proto:station,proto:station — measure just these (each entered from station-1 via Next)
const ONLY = flag('only', '') ? flag('only', '').split(',').map((x) => { const [p, s] = x.split(':'); return { p, s: Number(s) } }) : null
const OUT = path.join(process.cwd(), 'dev-shots', 'perf')
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
// --cpu N: Chrome DevTools CPU throttling (N x slower), to emulate a weaker device
const CPU = Number(flag('cpu', '1'))
if (CPU > 1) { const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }) }
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))

// A minimal DevTools global hook, installed before React loads: every renderer that
// injects (react-dom, @react-three/fiber's reconciler) gets an id, and every commit is
// counted per renderer package. Production React calls these hooks too.
await page.evaluateOnNewDocument(() => {
  const names = {}
  window.__probeCommits = {}
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject(r) { const id = Object.keys(names).length + 1; names[id] = r.rendererPackageName || `renderer${id}`; window.__probeCommits[names[id]] = 0; return id },
    onCommitFiberRoot(id) { const n = names[id]; if (n) window.__probeCommits[n]++ },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onScheduleFiberRoot() {}, checkDCE() {},
  }
})

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const index = await page.evaluate(async () => (await fetch('protocols/index.json')).json())
const load = (id) => page.evaluate(async (i) => (await fetch(`protocols/${i}.json`)).json(), id)

async function openRun(data, id, step) {
  const setter = await page.evaluateOnNewDocument((d, label) => {
    sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: label, lang: 'en', answers: {} }))
  }, data, id)
  await page.goto(`${BASE}/?run=1&step=${step}${PERF ? `&perf=${PERF}` : ''}`, { waitUntil: 'networkidle0' })
  await page.removeScriptToEvaluateOnNewDocument(setter.identifier)
  await page.waitForFunction(() => window.__benchperf && window.__benchperf.stations > 0, { timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2500)) // build + first frames settle
}

const clickButton = (re) => page.evaluate((src) => {
  const rx = new RegExp(src)
  const b = [...document.querySelectorAll('button')].find((x) => rx.test(x.textContent.trim()))
  if (b) { b.click(); return true }
  return false
}, re.source)

// Measure one station's animation window. Called right after entering the station.
async function measureWindow() {
  return page.evaluate((ms) => new Promise((resolve) => {
    const bp = window.__benchperf
    const snap = () => ({ calls: bp.calls, triangles: bp.triangles, geometries: bp.geometries, textures: bp.textures, programs: bp.programs })
    const c0 = { ...window.__probeCommits }
    const start = snap()
    const deltas = []
    let stale = 0, moving = 0, lastP = bp.p, last = performance.now()
    const t0 = last
    let settled = null  // snapshot 1.5 s in: entry-time uploads are done by then
    function loop(now) {
      deltas.push(now - last); last = now
      const p = bp.p
      if (p > 0 && p < 1) { moving++; if (p === lastP) stale++ }
      lastP = p
      if (!settled && now - t0 >= 1500) settled = snap()
      if (now - t0 < ms) requestAnimationFrame(loop)
      else {
        const c1 = window.__probeCommits
        const commits = {}
        for (const k of Object.keys(c1)) commits[k] = c1[k] - (c0[k] || 0)
        resolve({ deltas, stale, moving, start, settled: settled || start, end: snap(), commits })
      }
    }
    requestAnimationFrame(loop)
  }), WINDOW)
}

function summarise(raw) {
  const d = raw.deltas.slice(1).sort((a, b) => a - b) // drop the first (partial) delta
  const q = (f) => d[Math.min(d.length - 1, Math.floor(d.length * f))]
  return {
    frames: d.length,
    median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +d[d.length - 1].toFixed(1),
    dropped: d.filter((x) => x > 33).length,
    staleFrames: raw.stale, movingFrames: raw.moving,
    info: { start: raw.start, settled: raw.settled, end: raw.end },
    // entry: created while the station was being entered (one-off, first 1.5 s)
    entryGrowth: Object.fromEntries(['geometries', 'textures', 'programs'].map((k) => [k, raw.settled[k] - raw.start[k]])),
    // rising: STILL growing after entry, during steady animation — a per-frame leak
    rising: ['geometries', 'textures', 'programs'].filter((k) => raw.end[k] > raw.settled[k]),
    commits: raw.commits,
  }
}

async function station(data, id, name, k, n, enter) {
  const step = partitionSteps(data.steps || []).stations[k - 1] || {}
  await enter()
  const timed = await clickButton(/^▶?\s*Start$/)
  const raw = await measureWindow()
  const r = { protocol: id, name, station: k, of: n, action: step.action, container: step.container || null, timed, ...summarise(raw) }
  const c = r.commits
  console.log(`  ${id.padEnd(17)} ${String(k).padStart(2)}/${n} ${String(step.action).padEnd(14)} med ${String(r.median).padStart(5)} p95 ${String(r.p95).padStart(5)} drop ${String(r.dropped).padStart(3)} stale ${String(r.staleFrames).padStart(3)}/${String(r.movingFrames).padEnd(3)} calls ${r.info.end.calls} commits dom ${c['react-dom'] ?? 0} r3f ${c['@react-three/fiber'] ?? 0} entry+${r.entryGrowth.geometries}g/${r.entryGrowth.textures}t/${r.entryGrowth.programs}p${r.rising.length ? '  RISING ' + r.rising.join(',') : ''}`)
  return r
}

const results = []
if (ONLY) {
  for (const { p: id, s: k } of ONLY) {
    const meta = index.find((x) => x.id === id)
    const data = await load(id)
    const n = partitionSteps(data.steps || []).stations.length
    // enter k from k-1 via Next — the same flow the full run uses
    results.push(await station(data, id, meta.name, k, n, async () => {
      if (k === 1) await openRun(data, id, 1)
      else { await openRun(data, id, k - 1); await clickButton(/^Next/) }
    }))
    // --repeat N: re-enter the SAME station (Back, then Next) and measure again, in the same
    // page. A one-off upload shows once; a leak keeps growing on every revisit.
    for (let rep = 1; rep < REPEAT; rep++) {
      const r = await station(data, id, meta.name, k, n, async () => {
        await clickButton(/Back$/); await new Promise((res) => setTimeout(res, 1500)); await clickButton(/^Next/)
      })
      r.repeat = rep
      results.push(r)
    }
  }
} else {
  const wanted = PROTOCOLS === 'all' ? index : index.filter((p) => PROTOCOLS.split(',').includes(p.id))
  for (const meta of wanted) {
    const data = await load(meta.id)
    const n = partitionSteps(data.steps || []).stations.length
    await openRun(data, meta.id, 1)
    for (let k = 1; k <= n; k++) {
      results.push(await station(data, meta.id, meta.name, k, n, async () => { if (k > 1) await clickButton(/^Next/) }))
    }
  }
}
await browser.close()

fs.writeFileSync(path.join(OUT, `frames-${SET}.json`), JSON.stringify({ set: SET, perf: PERF, cpu: CPU, base: BASE, windowMs: WINDOW, errors: [...new Set(errors)], results }, null, 2))
const sorted = [...results].sort((a, b) => b.p95 - a.p95)
const lines = [`frame-probe · set=${SET} perf=${PERF || '(none)'} cpu=${CPU}x · ${results.length} stations · window ${WINDOW} ms`, '',
  'protocol           st  action          median   p95  drop  stale/moving  calls  tris     commits(dom/r3f)  rising']
for (const r of sorted) {
  lines.push(`${r.protocol.padEnd(18)} ${String(r.station).padStart(2)}  ${String(r.action).padEnd(14)} ${String(r.median).padStart(6)} ${String(r.p95).padStart(5)} ${String(r.dropped).padStart(5)}  ${`${r.staleFrames}/${r.movingFrames}`.padStart(12)}  ${String(r.info.end.calls).padStart(5)}  ${String(r.info.end.triangles).padStart(7)}  ${`${r.commits['react-dom'] ?? 0}/${r.commits['@react-three/fiber'] ?? 0}`.padStart(16)}  ${r.rising.join(',')}`)
}
fs.writeFileSync(path.join(OUT, `frames-${SET}.txt`), lines.join('\n') + '\n')
console.log(`\nwrote ${path.join(OUT, `frames-${SET}.json`)} and .txt${errors.length ? ` · ${errors.length} page error(s)` : ''}`)
