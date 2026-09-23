// Headless perf probe for the station scene. Measures real end-to-end frame pacing
// (rAF deltas) + draw calls / triangles (window.__benchperf), on the RNA run, in three
// cases: idle, during a pipette pour, and with a RUNNING timer (the stutter case).
//   node scripts/perf-probe.mjs [tag]
// Or probe chosen runner stations of any bundled protocol and/or harness URLs:
//   node scripts/perf-probe.mjs plates --protocol elisa --steps 10,18,27 \
//     --url '?matrix=1&action=measure&container=well_plate&p=0.9'
// (calls/tris come from window.__benchperf, which only the runner's StationScene sets.)
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null }
const tag = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'run'
const PROTOCOL = flag('protocol')
const STEPS = flag('steps')
const URLS = argv.flatMap((a, i) => (a === '--url' ? [argv[i + 1]] : []))
const SECONDS = Number(flag('seconds') || 4)
const W = 1440, H = 900

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', `--window-size=${W + 60},${H + 80}`,
    // --uncapped: lift the 60 Hz vsync cap so fps reflects the real per-frame cost —
    // capped, any scene that fits in 16.7 ms reads 60 and a regression is invisible
    ...(argv.includes('--uncapped') ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

// Measure rAF frame intervals for `ms`, return {fps, medianMs, p95Ms, calls, triangles}.
async function measure(ms) {
  return await page.evaluate(async (ms) => {
    const deltas = []
    let last = performance.now()
    await new Promise((resolve) => {
      const start = last
      function loop(now) {
        deltas.push(now - last); last = now
        if (now - start < ms) requestAnimationFrame(loop); else resolve()
      }
      requestAnimationFrame(loop)
    })
    deltas.sort((a, b) => a - b)
    const median = deltas[Math.floor(deltas.length / 2)]
    const p95 = deltas[Math.floor(deltas.length * 0.95)]
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length
    const p = window.__benchperf || {}
    return { fps: +(1000 / mean).toFixed(1), medianMs: +median.toFixed(2), p95Ms: +p95.toFixed(2),
             calls: p.calls, triangles: p.triangles, stations: p.stations, ticked: p.ticked }
  }, ms)
}

async function run(step, label, { startTimer = false, url = null } = {}) {
  // uncapped, the render loop never lets the network go idle — wait for the DOM + canvas
  const waitUntil = argv.includes('--uncapped') ? 'domcontentloaded' : 'networkidle0'
  await page.goto(url ? `${BASE}/${url}` : `${BASE}/?run=1&step=${step}`, { waitUntil, timeout: 60000 })
  await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 2500)) // let it build + settle
  if (startTimer) {
    // click the timer Start control in the left panel
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /start|resume/i.test(b.textContent))
      if (btn) { btn.click(); return btn.textContent.trim() }
      return null
    })
    await new Promise((r) => setTimeout(r, 800))
    if (!clicked) console.log(`    (no timer button found for ${label})`)
  }
  const m = await measure(SECONDS * 1000)
  console.log(`  ${label.padEnd(26)} fps=${String(m.fps).padStart(5)}  p95=${String(m.p95Ms).padStart(6)}ms  calls=${m.calls}  tris=${m.triangles}  ticked=${m.ticked}`)
  return m
}

console.log(`\n[perf ${tag}]`)
if (PROTOCOL || URLS.length) {
  if (PROTOCOL) {
    // preload the chosen protocol into the session (the runner otherwise defaults to RNA)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    const data = await page.evaluate(async (id) => (await fetch(`protocols/${id}.json`)).json(), PROTOCOL)
    await page.evaluateOnNewDocument((d, label) => {
      sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: label, lang: 'en', answers: {} }))
    }, data, PROTOCOL)
    for (const st of (STEPS || '1').split(',')) await run(Number(st), `${PROTOCOL} station ${st}`)
  }
  for (const u of URLS) await run(0, u.replace(/^\?/, '').slice(0, 26), { url: u })
} else {
  await run(3, 'idle (centrifuge)')          // station 3 = a spin
  await run(2, 'pipette pour')               // station 2 = pour_add
  await run(11, 'timer running (incubate)', { startTimer: true }) // station 11 = 15-min incubate
}
await browser.close()
console.log('done')
