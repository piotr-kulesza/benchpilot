// Headless perf probe for the station scene. Measures real end-to-end frame pacing
// (rAF deltas) + draw calls / triangles (window.__benchperf), on the RNA run, in three
// cases: idle, during a pipette pour, and with a RUNNING timer (the stutter case).
//   node scripts/perf-probe.mjs [tag]
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const tag = process.argv[2] || 'run'
const W = 1440, H = 900

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', `--window-size=${W + 60},${H + 80}`] })
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

async function run(step, label, { startTimer = false } = {}) {
  await page.goto(`${BASE}/?run=1&step=${step}`, { waitUntil: 'networkidle0' })
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
  const m = await measure(4000)
  console.log(`  ${label.padEnd(26)} fps=${String(m.fps).padStart(5)}  p95=${String(m.p95Ms).padStart(6)}ms  calls=${m.calls}  tris=${m.triangles}  ticked=${m.ticked}`)
  return m
}

console.log(`\n[perf ${tag}]`)
await run(3, 'idle (centrifuge)')          // station 3 = a spin
await run(2, 'pipette pour')               // station 2 = pour_add
await run(11, 'timer running (incubate)', { startTimer: true }) // station 11 = 15-min incubate
await browser.close()
console.log('done')
