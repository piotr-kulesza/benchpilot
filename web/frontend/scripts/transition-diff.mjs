// transition-diff.mjs — compare two recordings of the station-change transitions (scripts/transition-record.mjs):
// a reference build (e972bcf) and this one, frame n of both being the same moment of normalised time.
//
//   node scripts/transition-diff.mjs --ref e.json --cur p.json [--md out.md] [--tol 1e-3]
//
// Per transition, the largest difference over its frames: the camera (position, quaternion, FOV) and each
// travelling vessel's position. A difference that is the SAME at every frame is not the transition's motion
// but where it starts or ends (the station's measured framing; a vessel's seat): reported apart, as an
// offset, with the motion's own difference after it is taken out.
import fs from 'fs'

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const TOL = +arg('tol', 1e-3)
const ref = JSON.parse(fs.readFileSync(arg('ref'), 'utf8')), cur = JSON.parse(fs.readFileSync(arg('cur'), 'utf8'))
const qd = (a, b) => Math.min(Math.max(...a.map((x, i) => Math.abs(x - b[i]))), Math.max(...a.map((x, i) => Math.abs(x + b[i]))))
const rows = []
for (const T of cur.transitions) {
  const R = ref.transitions.find((t) => t.from === T.from)
  if (!R) continue
  const n = Math.min(R.frames.length, T.frames.length)
  let camPos = 0, camQ = 0, fov = 0
  const off0 = [0, 1, 2].map((i) => T.frames[0].cam[i] - R.frames[0].cam[i])
  let camShape = 0
  const ves = new Map()   // key → { max, start, end, shape }
  for (let f = 0; f < n; f++) {
    const a = R.frames[f], b = T.frames[f]
    for (let i = 0; i < 3; i++) { const d = b.cam[i] - a.cam[i]; camPos = Math.max(camPos, Math.abs(d)); camShape = Math.max(camShape, Math.abs(d - off0[i])) }
    camQ = Math.max(camQ, qd(a.cam.slice(3, 7), b.cam.slice(3, 7)))
    fov = Math.max(fov, Math.abs(a.cam[7] - b.cam[7]))
    const keys = new Set([...a.vs, ...b.vs].filter((v) => v[1]).map((v) => v[0]))
    for (const k of keys) {
      const va = a.vs.find((v) => v[0] === k), vb = b.vs.find((v) => v[0] === k)
      const e = ves.get(k) || { max: 0, shown: '', start: null, end: null }
      if (!va || !vb || va[1] !== vb[1]) { e.shown = `shown in ${va && va[1] ? 'e972bcf' : 'polish'} only`; ves.set(k, e); continue }
      const d = [2, 3, 4].map((i) => vb[i] - va[i])
      const m = Math.max(...d.map(Math.abs))
      e.max = Math.max(e.max, m)
      if (e.start == null) e.start = m
      e.end = m
      ves.set(k, e)
    }
  }
  rows.push({ from: T.from, to: T.to, n, camPos, camShape, camOff: off0, camQ, fov, ves: [...ves.entries()] })
}
const ok = (x) => (x <= TOL ? '✓' : '✗')
const f3 = (x) => (x < 1e-6 ? '0' : x < 1e-3 ? x.toExponential(1) : x.toFixed(3))
const lines = []
lines.push(`### ${cur.protocol}`, '', `| transition | frames | camera pos max Δ | of it, the station's framing (constant) | camera motion Δ (framing taken out) | quaternion Δ | FOV Δ | vessels: max Δ (at start / at end) |`, '|---|---|---|---|---|---|---|---|')
let allMotion = true, allRaw = true
for (const r of rows) {
  const vtxt = r.ves.map(([k, e]) => `${k} ${e.shown || `${f3(e.max)} (${f3(e.start)} / ${f3(e.end)})`}`).join('; ') || '–'
  const off = Math.max(...r.camOff.map(Math.abs))
  const vOk = r.ves.every(([, e]) => !e.shown && e.max <= TOL)
  if (!(r.camShape <= TOL && r.camQ <= TOL && r.fov <= TOL)) allMotion = false
  if (!(r.camPos <= TOL && r.camQ <= TOL && r.fov <= TOL && vOk)) allRaw = false
  lines.push(`| ${r.from} → ${r.to} | ${r.n} | ${f3(r.camPos)} ${ok(r.camPos)} | ${off > TOL ? `${r.camOff.map((x) => x.toFixed(3)).join(', ')}` : '–'} | ${f3(r.camShape)} ${ok(r.camShape)} | ${f3(r.camQ)} ${ok(r.camQ)} | ${f3(r.fov)} ${ok(r.fov)} | ${vtxt} ${vOk ? '✓' : '✗'} |`)
}
lines.push('', `camera motion within ${TOL} on every transition: ${allMotion ? 'yes' : 'NO'} · everything (camera incl. framing, vessels) within ${TOL}: ${allRaw ? 'yes' : 'NO'}`, '')
const md = lines.join('\n')
if (arg('md', '')) fs.appendFileSync(arg('md'), md + '\n')
console.log(md)
