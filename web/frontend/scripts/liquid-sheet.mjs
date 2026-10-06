// liquid-sheet.mjs — THE LIQUID SHEET: every station of a protocol at the start, middle and
// end of its step, on the live runner, with the ledger's volume (liquidLedger.js) printed under
// each tile beside what the scene actually DRAWS (each vessel's liquid read back through its
// drawn shape) and what the pipette tip holds.
//
//   node scripts/liquid-sheet.mjs [--protocol neutrophil_rna] [--out dev-shots/liquid]
// Needs the VITE DEV server on $BASE (window.__benchLine). Deterministic (fixed-step clock).
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { deterministic } from './lib/determinism.mjs'
import { partitionSteps, timerSeconds } from '../src/lib/runtime.js'
import { buildLedger, fmt } from '../src/vessel/liquidLedger.js'
import { sampleContainerSequence } from '../src/vessel/sceneRecipe.js'
import { reagentColor } from '../src/vessel/theme.js'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const ID = flag('protocol', 'neutrophil_rna')
const OUT = flag('out', path.join(process.cwd(), 'dev-shots', 'liquid', ID))
const ONLY = flag('only', '') ? flag('only', '').split(',').map(Number) : null
fs.mkdirSync(OUT, { recursive: true })

const data = JSON.parse(fs.readFileSync(path.join('public/protocols', ID + '.json'), 'utf8'))
const stations = partitionSteps(data.steps).stations
const ledger = buildLedger(stations, { containers: sampleContainerSequence(stations), colorOf: (n) => parseInt(reagentColor(n).slice(1), 16) })

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 0,
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.evaluateOnNewDocument((d) => {
  sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: 'liquid-sheet', lang: 'en', answers: {} }))
}, data)
const goto = (url) => page.goto(url, { waitUntil: 'networkidle0' }).catch(() => page.goto(url, { waitUntil: 'load', timeout: 60000 }))

// in the page: what every visible vessel draws now (and what the scene asked it to hold)
const READ = () => {
  const L = window.__benchLine, S = L.sample(), st = L.stations()[L.active()]
  const seen = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }
  const out = {}
  const put = (k, v) => { if (v && seen(v) && v.userData.drawnUl) out[k] = { drawn: v.userData.drawnUl(), asked: v.userData.volUl } }
  for (const k of ['tube', 'column', 'elu', 'cryovial', 'wellplate', 'flask', 'dish']) put(k, S[k])
  if (S.column && seen(S.column) && S.column.userData.drawnFlowUl) out.flow = { drawn: S.column.userData.drawnFlowUl() }
  for (const pv of L.preps()) if (seen(pv) && pv.userData.drawnUl) out['prep'] = { drawn: pv.userData.drawnUl(), asked: pv.userData.volUl }
  if (st.pip && seen(st.pip) && st.pip.userData.drawnUl) out.tip = { drawn: st.pip.userData.drawnUl() }
  return out
}

const rows = []
for (let s = 1; s <= stations.length; s++) {
  if (ONLY && !ONLY.includes(s)) continue
  const det = await deterministic(page, `liquid/${ID}/${s}`, 3000)
  await goto(`${BASE}/?run=1&step=${Math.max(1, s - 1)}`)
  await det.settled()
  if (s > 1) {
    await page.evaluate(async () => { const d = await import('/src/dev/collisionDriver.js'); d.finishStation(window.__benchLine) })
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Next/.test(x.textContent.trim())).click())
    await new Promise((r) => setTimeout(r, 400))
  }
  const st = stations[s - 1], rec = ledger.stations[s - 1]
  const tiles = []
  for (const [label, target] of [['start', 0], ['middle', 0.5], ['end', 1]]) {
    // drive the held frame loop to p = target (from where it is), then let the liquids settle
    const got = await page.evaluate((target, label) => {
      const L = window.__benchLine, fps = 60
      const S = L.sample()
      const arriving = () => (S && S.vessels.some((v) => v.visible && v.userData.trip)) || L.preps().some((v) => v.visible && v.userData.trip)
      const st = L.stations()[L.active()], dur = st.duration || 6.5
      L.hold = true
      if (label === 'start') { L.pForce = 0; for (let k = 0; k < 360 && arriving(); k++) L.step(1 / fps); for (let k = 0; k < 90; k++) L.step(1 / fps) }
      else {
        const from = L._p || 0, n = Math.max(1, Math.round((target - from) * dur * fps))
        for (let k = 1; k <= n; k++) { L.pForce = from + (target - from) * k / n; L.step(1 / fps) }
        if (label === 'end') for (let k = 0; k < 150; k++) L.step(1 / fps)   // settle at p = 1
      }
      L._p = target
      return { dur }
    }, target, label)
    const vols = await page.evaluate(READ)
    await page.evaluate(() => { window.__bpFrameLimit = window.__bpFrames + 2; requestAnimationFrame(() => {}) })   // two real frames, drawn with the post chain (the kick restarts the frozen clock)
    await page.waitForFunction(() => window.__bpFrames >= window.__bpFrameLimit, { polling: 30 })
    await new Promise((r) => setTimeout(r, 100))
    const box = await page.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
    const file = path.join(OUT, `${String(s).padStart(2, '0')}_${label}.png`)
    await page.screenshot({ path: file, clip: box })
    tiles.push({ label, file, vols, dur: got.dur })
  }
  await page.evaluate(() => { window.__benchLine.pForce = null; window.__benchLine._p = 0 })
  rows.push({ s, step: st, rec, tiles, timed: timerSeconds(st) > 0 })
  const v = (side) => Object.entries(rec[side]).filter(([, x]) => x.ul > 0).map(([k, x]) => `${k} ${fmt(x.ul)}`).join(', ') || 'empty'
  console.log(`${String(s).padStart(2)} ${st.action.padEnd(14)} start: ${v('start')}  →  end: ${v('end')}   drawn end: ${Object.entries(tiles[2].vols).map(([k, x]) => `${k} ${fmt(x.drawn)}`).join(', ')}`)
  await det.dispose()
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'sheet.json'), JSON.stringify(rows.map((r) => ({ s: r.s, index: r.step.index, action: r.step.action, text: r.step.text_en, rec: r.rec, tiles: r.tiles.map((t) => ({ label: t.label, file: path.basename(t.file), vols: t.vols, dur: t.dur })) })), null, 1))
if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 5).join(' | '))
console.log('→', OUT)
