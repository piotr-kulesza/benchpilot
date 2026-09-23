// shots.mjs — render the FIXED review set and write it to a named set folder.
//
// The point: stop producing one-off PNGs with ad-hoc names. This renders a
// declared, reproducible set so two runs are comparable and a vision model can
// audit the whole thing in one pass.
//
//   node scripts/shots.mjs                          # → dev-shots/current/**
//   node scripts/shots.mjs --set baseline           # refresh the committed baseline
//   node scripts/shots.mjs --groups models,matrix   # subset
//   node scripts/shots.mjs --protocols pcr,western  # subset of runner protocols
//   node scripts/shots.mjs --steps 6                # runner shots per protocol
//
// Needs the VITE DEV server (not preview/build) on $BASE — the model and matrix
// lists are imported from src/dev/registry.js *in the browser*, so this script can
// never drift from the registry the app actually uses.
//
//   cd web/frontend && npm run dev
//
// Each group writes a manifest.json that scripts/contact-sheet.mjs turns into a
// captioned contact sheet.
import { deterministic } from './lib/determinism.mjs'
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
// The runner's step numbering comes from this exact function — import it rather
// than re-deriving it, or captions drift from what the screenshot shows.
import { partitionSteps } from '../src/lib/runtime.js'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:4319'
const ROOT = process.env.OUT || path.join(process.cwd(), 'dev-shots')

const argv = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const SET = flag('set', 'current')
const GROUPS = flag('groups', 'models,matrix,runner').split(',').map((s) => s.trim())
const PROTOCOLS = flag('protocols', 'all')
const STEPS_PER = Number(flag('steps', '4'))
// Matrix timeline points to capture, comma separated. A single frame cannot show
// whether a motion completed: 0.55 catches the action mid-commitment, 0.9 catches
// where it ends up. Judging "the gel never entered the tank" or "the drop was
// released too high" needs both.
const MATRIX_PS = flag('p', '0.55,0.9').split(',').map(Number)
const SETTLE = Number(flag('settle', '7600'))
// Deterministic by default: seeded Math.random (seed = tile name) + a fixed-step clock
// frozen after `settle` ms of simulated time — see scripts/lib/determinism.mjs.
// --no-seed restores the old wall-clock capture (non-reproducible; for debugging only).
const SEEDED = !argv.includes('--no-seed')

// Stations that must ALWAYS be captured, on top of the even spacing: the ones
// carrying findings, so a --diff can show them fixed. Without this a defect on an
// unsampled station has no before-tile and can never be proven fixed.
// dev-shots/pins.json — { "protocolId": [stationNumber, ...] }
const PINS_FILE = path.join(ROOT, 'pins.json')
const PINS = fs.existsSync(PINS_FILE) ? JSON.parse(fs.readFileSync(PINS_FILE, 'utf8')) : {}

// A capture starts from an EMPTY group folder. Leftovers from an earlier run are
// not referenced by the new manifest, so the sheets are clean, but anyone browsing
// the folder would read them as current — an unlabelled render is exactly what this
// harness exists to abolish.
const freshDir = (group) => {
  const d = path.join(ROOT, SET, group)
  fs.rmSync(d, { recursive: true, force: true })
  fs.mkdirSync(d, { recursive: true })
  return d
}

const outDir = (group) => {
  const d = path.join(ROOT, SET, group)
  fs.mkdirSync(d, { recursive: true })
  return d
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1500,980'],
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e.message)))

// ── pull the catalogue from the app itself ────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const registry = await page.evaluate(async () => {
  const m = await import('/src/dev/registry.js')
  return {
    models: m.MODELS.map((x) => ({ id: x.id, kind: x.kind, orient: x.orient })),
    cells: m.MATRIX_CELLS,
    transitions: m.MATRIX_TRANSITIONS,
  }
}).catch((e) => {
  console.error('\n  Could not import src/dev/registry.js from the page.')
  console.error('  Is the VITE DEV server running on', BASE, '? (npm run dev)\n')
  throw e
})
console.log(`registry: ${registry.models.length} models, ${registry.cells.length} matrix cells, ${registry.transitions.length} transitions`)

const shoot = async (file, url, { w = 1100, h = 850, settle = 700 } = {}) => {
  await page.setViewport({ width: w, height: h })
  // the tile's name (group/file) seeds it — stable across sets, distinct across tiles
  // Simulated time = settle + the ~500 ms networkidle0 quiet window: the old wall-clock
  // capture rendered through that window too, so a tile lands at the same point in its
  // eased timeline as before (without it, e.g. a spin column is caught not yet seated).
  const det = SEEDED ? await deterministic(page, path.relative(path.join(ROOT, SET), file), settle + 500) : null
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {})
  if (det) await det.settled()
  else await new Promise((r) => setTimeout(r, settle))
  await page.screenshot({ path: file })
  if (det) await det.dispose()
}

const writeManifest = (group, entries) => {
  fs.writeFileSync(path.join(outDir(group), 'manifest.json'), JSON.stringify({ set: SET, group, entries }, null, 2))
}

// ── models: every model, two angles, captioned with its stated correct pose ────
if (GROUPS.includes('models')) {
  const dir = freshDir('models')
  const entries = []
  for (const m of registry.models) {
    for (const angle of ['front', 'top']) {
      const name = `${m.id}__${angle}.png`
      await shoot(path.join(dir, name), `${BASE}/?models=1&item=${m.id}&angle=${angle}`)
      // The caption IS the ground truth: registry `orient` states the correct
      // resting pose, so the render can be judged against declared intent.
      entries.push({ file: name, title: `${m.id} · ${angle}`, caption: m.orient, kind: m.kind })
    }
    console.log('  model', m.id)
  }
  writeManifest('models', entries)
}

// ── matrix: every (action × container) cell + declared transitions ─────────────
if (GROUPS.includes('matrix')) {
  const dir = freshDir('matrix')
  const entries = []
  const ptag = (p) => `p${String(p).replace('.', '')}`
  for (const c of registry.cells) {
    for (const mp of MATRIX_PS) {
      const name = `${c.action}__${c.container}__${ptag(mp)}.png`
      const qs = new URLSearchParams({ matrix: '1', action: c.action, container: c.container, p: String(mp) })
      await shoot(path.join(dir, name), `${BASE}/?${qs}`, { settle: 900 })
      entries.push({ file: name, title: `${c.action} · ${c.container}`, caption: `timeline p=${mp}` })
    }
  }
  for (const [from, to] of registry.transitions) {
    for (const mp of MATRIX_PS) {
      const name = `transfer__${from}-${to}__${ptag(mp)}.png`
      const qs = new URLSearchParams({ matrix: '1', action: 'transfer', container: to, from, to, p: String(mp) })
      await shoot(path.join(dir, name), `${BASE}/?${qs}`, { settle: 900 })
      entries.push({ file: name, title: `transfer · ${from} → ${to}`, caption: `timeline p=${mp}` })
    }
  }
  console.log(`  matrix: ${entries.length} cells`)
  writeManifest('matrix', entries)
}

// ── runner: the real app, across every bundled protocol ───────────────────────
if (GROUPS.includes('runner')) {
  const dir = freshDir('runner')
  const entries = []
  const index = await page.evaluate(async () => (await fetch('protocols/index.json')).json())
  const wanted = PROTOCOLS === 'all' ? index : index.filter((p) => PROTOCOLS.split(',').includes(p.id))

  for (const p of wanted) {
    const data = await page.evaluate(async (id) => (await fetch(`protocols/${id}.json`)).json(), p.id)
    await page.evaluateOnNewDocument((d, label) => {
      sessionStorage.setItem('benchpilot.session', JSON.stringify({ protocol: d, source: label, lang: 'en', answers: {} }))
    }, data, p.id)

    // ?step=N indexes the STATION list, not protocol.steps: partitionSteps drops
    // prep_ahead and non-actionable steps, so the two lists differ (neutrophil_rna
    // 31 → 26, transformation 10 → 9, gram_stain 15 → 14). Caption from the list the
    // runner actually renders, or the tile describes a different step than it shows.
    const stations = partitionSteps(data.steps || []).stations
    const n = stations.length
    // evenly spaced across the protocol, always including the first and last step
    const picks = STEPS_PER >= n
      ? Array.from({ length: n }, (_, i) => i + 1)
      : Array.from({ length: STEPS_PER }, (_, i) => 1 + Math.round((i * (n - 1)) / (STEPS_PER - 1)))
    const pins = (PINS[p.id] || []).filter((x) => Number.isInteger(x) && x >= 1 && x <= n)
    for (const s of [...new Set([...picks, ...pins])].sort((a, b) => a - b)) {
      const step = stations[s - 1] || {}
      const name = `${p.id}__step${String(s).padStart(2, '0')}.png`
      await shoot(path.join(dir, name), `${BASE}/?run=1&step=${s}`, { w: 1440, h: 900, settle: SETTLE })
      entries.push({
        file: name,
        title: `${p.name} · step ${s}/${n}`,
        caption: [step.action || '?', step.container || '?'].join(' · ') + (step.text_en ? ` — ${String(step.text_en).slice(0, 110)}` : ''),
      })
    }
    console.log('  runner', p.id, `(${picks.length} steps of ${n})`)
  }
  writeManifest('runner', entries)
}

await browser.close()
if (pageErrors.length) {
  console.log(`\n${pageErrors.length} page error(s) during capture:`)
  for (const e of [...new Set(pageErrors)].slice(0, 20)) console.log('  -', e)
}
console.log(`\ndone → ${path.join(ROOT, SET)}`)
console.log(`next: node scripts/contact-sheet.mjs ${SET}`)
