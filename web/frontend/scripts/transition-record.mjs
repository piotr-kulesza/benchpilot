// transition-record.mjs — record every station-change TRANSITION of a protocol, frame by frame: the
// camera (position, quaternion, FOV) and every travelling vessel (the sample's vessels, the preps).
// Works on ANY build of the app — e972bcf has none of the later dev hooks — through what both have: a
// mocked frame clock + requestAnimationFrame (the page renders only when stepped), R3F's own `_roots`
// (the camera and the scene) and the runner's Next button.
//
//   BASE=http://localhost:4336 node scripts/transition-record.mjs --protocol neutrophil_rna --rate 96 --clock 1 --out e.json
//   BASE=http://localhost:4321 node scripts/transition-record.mjs --protocol neutrophil_rna --rate 60 --clock 1.6 --out p.json
//
// --rate: frames per second of the recorded clock; --clock: the factor the clock runs at against the
// normalised time (e972bcf: 96 fps and 1 — polish, slowed by TRANSITION_SLOWDOWN = 1.6: 60 fps and 1.6;
// so frame n of both is the same moment of normalised time, and the camera's sway is in phase).
// Each transition k → k+1: deep link to station k, let it settle, set the clock to the same normalised
// moment, press Next, record --seconds of normalised time. scripts/transition-diff.mjs compares two.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const BASE = process.env.BASE || 'http://localhost:4321'
const PROTO = arg('protocol', 'neutrophil_rna'), RATE = +arg('rate', 60), CLOCK = +arg('clock', 1)
const SECONDS = +arg('seconds', 4), SETTLE = +arg('settle', 40), OUT = arg('out', 'transitions.json')
const ONLY = arg('only', '') ? arg('only').split(',').map(Number) : null
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const data = JSON.parse(fs.readFileSync(path.join('public', 'protocols', PROTO + '.json'), 'utf8'))
const runtime = await import(path.resolve('src/lib/runtime.js'))
const N = runtime.partitionSteps(data.steps).stations.length
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 0, args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] })
const out = { base: BASE, protocol: PROTO, rate: RATE, clock: CLOCK, transitions: [] }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

for (let k = 1; k < N; k++) {
  if (ONLY && !ONLY.includes(k)) continue
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.evaluateOnNewDocument((d) => {
    sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: 'transition-record', lang: 'en', answers: {} }))
    window.__now = 0
    performance.now = () => window.__now
    let q = [], id = 0
    window.requestAnimationFrame = (cb) => { q.push([++id, cb]); return id }
    window.cancelAnimationFrame = (n) => { q = q.filter((e) => e[0] !== n) }
    window.__step = (ms) => { window.__now += ms; const run = q; q = []; for (const [, cb] of run) cb(window.__now) }
  }, data)
  await page.goto(`${BASE}/?run=1&step=${k}`, { waitUntil: 'networkidle0' })
  // the app comes up (its effects run on real timers; it renders only when stepped)
  for (let i = 0; i < 40; i++) { await page.evaluate(() => window.__step(50)); await sleep(25) }
  const fiberUrl = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('@react-three_fiber.js')))
  await page.evaluate(async (u) => {
    const R3F = await import(u)
    window.__r3f = () => [...R3F._roots.values()][0].store.getState()
    window.__demo = await import('/src/scene/demoScene.js')   // the same module instance the app uses (dev server)
  }, fiberUrl)
  // settle: the station runs to its end (a timed one rests, its countdown not started)
  for (let i = 0; i < SETTLE * 20; i++) { await page.evaluate(() => window.__step(50)); if (i % 40 === 0) await sleep(5) }
  // the same normalised moment on both builds: T = 1000 s (the camera's sway reads the clock)
  const stepMs = 1000 / RATE
  await page.evaluate((target, stepMs) => { window.__now = target - 2 * stepMs; window.__step(stepMs); window.__step(stepMs) }, 1000 * 1000 * CLOCK, stepMs)
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Next/.test(x.textContent.trim())); if (b) b.click(); return !!b })
  await sleep(400)   // React commits the step change (its effect) on real timers
  const frames = []
  const F = Math.round(SECONDS * RATE * CLOCK)   // SECONDS of normalised time (RATE × CLOCK frames per normalised second)
  for (let f = 0; f < F; f++) {
    frames.push(await page.evaluate((stepMs) => {
      window.__step(stepMs)
      const s = window.__r3f(), c = s.camera
      // every travelling vessel by its name in the sample (tube, column, flask …) or its prep id, in the world
      const vs = [], S = window.__demo.getSample(), w = { x: 0, y: 0, z: 0 }
      // [key, shown, x, y, z, its goal this frame (exitLift, else tPos) x, y, z, docked]
      const put = (key, o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements, g = o.userData.exitLift || o.userData.tPos
        vs.push([key, o.visible ? 1 : 0, +e[12].toFixed(6), +e[13].toFixed(6), +e[14].toFixed(6), +g.x.toFixed(6), +g.y.toFixed(6), +g.z.toFixed(6), o.userData.docked ? 1 : 0]) }
      if (S) for (const [k, o] of Object.entries(S)) if (o && o.isObject3D && k !== 'active') put(k, o)
      for (const o of window.__demo.getPreps()) put('prep:' + o.userData.prepId, o)
      return { cam: [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w, c.fov].map((x) => +x.toFixed(6)), vs }
    }, stepMs))
  }
  out.transitions.push({ from: k, to: k + 1, clicked, frames })
  console.log(`  ${PROTO} ${k} → ${k + 1}  ${clicked ? '' : '(no Next)'}`)
  await page.close()
  fs.writeFileSync(OUT, JSON.stringify(out))
}
await browser.close()
console.log(`→ ${OUT}`)
