// protocolCheck.js — EVERY RULE, ON EVERY STATION OF ANY PROTOCOL, on the runner's own clock.
// Driven by scripts/check-protocol.mjs (in the page, window.__benchLine — dev builds).
//
//   liquid    (a) a volume changes only during a transfer, (b) a colour only during an inflow,
//             (c) vessels + tips conserved every frame, (d) no jump at a station boundary
//             (src/dev/liquidFrames.js)
//   speed     no visible mesh moves faster than MAX_SPEED / tempo (+10 %) — the rotor's spin and
//             what rides in it excepted; the camera no faster than CAMERA_MAX_SPEED / tempo
//   teleport  no isolated one-frame jump of a mesh or the camera; nothing hidden and shown again
//             somewhere else
//   collision the collision + motion audit (src/dev/collisionAudit.js, motionAudit.js)
//   capacity  a tip never holds more than its pipette takes; each pass's pipette is the one its
//             volume calls for (≤ 200 µl a P200; 201–1000 µl ONE P1000 pass; more: P1000 passes)
// The pure parts are exported and proven red by protocolCheck.test.js.
import { Vector3 } from 'three'
import { MAX_SPEED, CAMERA_MAX_SPEED } from '../scene/motionPlan.js'
import { animationTempo } from '../scene/tempo.js'
import { sampleLiquids, checkFrames, checkBoundary } from './liquidFrames.js'
import { simulateStationAsync } from './collisionDriver.js'

export const SPEED_TOL = 1.1
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const JUMP = 0.08                 // world units in one frame, isolated (≥ 4× either side) → a teleport
export const REAPPEAR = 0.05             // hidden, then shown this far from where it was → a teleport
export const P200_UL = 200, P1000_UL = 1000

// ── pure ──
// the passes a stated pipette move calls for (rule 1)
export function passesFor(ul) {
  if (!(ul > 0)) return []
  if (ul <= P200_UL) return [{ kind: 'P200', ul }]
  if (ul <= P1000_UL) return [{ kind: 'P1000', ul }]
  const n = Math.ceil(ul / P1000_UL - 1e-9)
  return Array.from({ length: n }, () => ({ kind: 'P1000', ul: ul / n }))
}
// expected passes vs the passes seen (both [{kind, ul}]), in order; volumes to 1 %
export function comparePasses(expected, seen) {
  const bad = []
  const n = Math.max(expected.length, seen.length)
  for (let i = 0; i < n; i++) {
    const e = expected[i], s = seen[i]
    if (!s) { bad.push(`pass ${i + 1}: expected ${e.kind} ${fmt(e.ul)}, none seen`); continue }
    if (!e) { bad.push(`pass ${i + 1}: ${s.kind} ${fmt(s.ul)} not called for`); continue }
    if (e.kind !== s.kind) bad.push(`pass ${i + 1}: ${fmt(e.ul)} needs a ${e.kind}, drawn with a ${s.kind}`)
    else if (Math.abs(e.ul - s.ul) > Math.max(0.5, 0.01 * e.ul)) bad.push(`pass ${i + 1}: ${e.kind} drew ${fmt(s.ul)}, expected ${fmt(e.ul)}`)
  }
  return bad
}
const fmt = (ul) => (ul >= 1000 ? `${+(ul / 1000).toFixed(3)} mL` : `${+ul.toFixed(1)} µl`)
// one frame's displacement d[k] among its neighbours: an isolated jump?
export function isolatedJump(prev, cur, next, jump = JUMP) { return cur >= jump && cur >= 4 * Math.max(prev || 0, next || 0) }

// ── in the page ──
const _a = new Vector3(), _b = new Vector3()
const skipped = (o) => o.isSprite || o.isLight || (o.userData && (o.userData.auditKind === 'fluid' || o.userData.auditKind === 'effect' || o.userData.auditKind === 'granular' || o.userData.spinPart))
const fluidMat = (m) => { const mm = Array.isArray(m.material) ? m.material : [m.material]; return mm.some((x) => x && x.userData && (x.userData.auditKind === 'fluid' || x.userData.auditKind === 'effect' || x.userData.auditKind === 'granular')) }
const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }
const nameOf = (o) => (o.userData && o.userData.builder ? o.userData.builder.replace(/^build/, '') : o.name || o.type)

// every visible solid mesh near the rail: the active station, its neighbours, the sample, the preps
function bodies(line) {
  const sts = line.stations(), a = line.active(), out = []
  const add = (root, label) => {
    const walk = (o) => {
      if (skipped(o)) return
      if (o.isMesh && o.geometry && !fluidMat(o)) out.push({ mesh: o, label })
      for (const c of o.children) walk(c)
    }
    walk(root)
  }
  for (let i = Math.max(0, a - 1); i <= Math.min(sts.length - 1, a + 1); i++) {
    const st = sts[i]
    const role = new Map([[st.pip, 'pipette'], [st.cen, 'centrifuge'], [st.dev, 'instrument'], [st.prep, 'prep'], [st.waste, 'waste']])
    for (const p of Object.values(st.pips || {})) role.set(p, p.userData.kind || 'pipette')
    for (const [k, r] of Object.entries(st.reagents || {})) if (r && r.grp) role.set(r.grp, `bottle ${k}`)
    st.group.children.forEach((c) => { if (c !== st.label && c !== st.dial) add(c, `${i === a ? '' : i < a ? 'prev · ' : 'next · '}${role.get(c) || nameOf(c)}`) })
  }
  // a vessel docked in a rotor RIDES the spin — the one motion the speed rule excepts
  const riding = (v) => { for (let n = v.parent; n; n = n.parent) if (n.userData && n.userData.spinPart) return true; return false }
  const S = line.sample()
  if (S) S.vessels.forEach((v) => { if (!riding(v)) add(v, `sample ${nameOf(v)}`) })
  line.preps().forEach((v, k) => { if (!riding(v)) add(v, `prep ${k}`) })
  return out
}
// the 8 corners of a mesh's geometry box, in the world
function corners(mesh, out) {
  const g = mesh.geometry
  if (!g.boundingBox) g.computeBoundingBox()
  const b = g.boundingBox
  let i = 0
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    (out[i] || (out[i] = new Vector3())).set(x, y, z).applyMatrix4(mesh.matrixWorld); i++
  }
  return out
}

// A per-frame tracker: speed and teleports of every mesh and the camera.
export function createMotionTracker(line, { fps = 60 } = {}) {
  const tempo = animationTempo()
  const cap = (MAX_SPEED / tempo) * SPEED_TOL, camCap = (CAMERA_MAX_SPEED / tempo) * SPEED_TOL
  const st = new Map()                 // mesh → { pts, d1 (last frame's displacement), last visible pts, label }
  const speed = new Map()              // label → { peak, frames over, firstFrame }
  const teleports = []
  let cam = null, camPeak = 0, camOver = 0, camD = [0, 0]
  const camTele = []
  const over = (label, v, k) => {
    let s = speed.get(label); if (!s) { s = { label, peak: 0, over: 0, frame: null }; speed.set(label, s) }
    if (v > s.peak) { s.peak = v; s.peakFrame = k; s.peakP = +((window.__benchperf && window.__benchperf.p) || 0).toFixed(3); const pp = line.stations()[line.active()]; s.peakPhase = pp && pp.pip ? pp.pip.userData.phase : null }
    if (v > cap) { s.over++; if (s.frame == null) s.frame = k }
  }
  return {
    cap, camCap,
    frame(k) {
      const scene = line.stations()[line.active()].group.parent
      scene && scene.updateMatrixWorld(true)
      const seen = new Set()
      for (const { mesh, label } of bodies(line)) {
        seen.add(mesh)
        const vis = shown(mesh)
        let e = st.get(mesh)
        if (!vis) { if (e) e.hidden = true; continue }
        const pts = corners(mesh, [])
        if (!e) { st.set(mesh, { pts, d: [0, 0], label }); continue }
        if (e.hidden) {                     // shown again: where it was?
          let gap = 0; for (let i = 0; i < 8; i++) gap = Math.max(gap, pts[i].distanceTo(e.pts[i]))
          if (gap > REAPPEAR) teleports.push({ frame: k, object: label, kind: 'reappears elsewhere', dist: +gap.toFixed(3) })
          e.hidden = false; e.pts = pts; e.d = [0, 0]; continue
        }
        let d = 0; for (let i = 0; i < 8; i++) d = Math.max(d, pts[i].distanceTo(e.pts[i]))
        e.pts = pts
        // the frame before last, judged now that its neighbours are known
        if (isolatedJump(e.d[0], e.d[1], d)) teleports.push({ frame: k - 1, object: label, kind: 'jump', dist: +e.d[1].toFixed(3) })
        e.d = [e.d[1], d]
        over(label, d * fps, k)
      }
      for (const m of st.keys()) if (!seen.has(m)) st.get(m).hidden = true
      const c = line.camera && line.camera()
      if (c) {
        const p = c.position.clone()
        if (cam) {
          const d = p.distanceTo(cam)
          if (isolatedJump(camD[0], camD[1], d, 0.5)) camTele.push({ frame: k - 1, dist: +camD[1].toFixed(3) })
          camD = [camD[1], d]
          const v = d * fps; if (v > camPeak) camPeak = v; if (v > camCap) camOver++
        }
        cam = p
      }
    },
    cut() { for (const e of st.values()) { e.hidden = true }; cam = null; camD = [0, 0] },
    result() {
      return {
        speed: [...speed.values()].filter((s) => s.over).map((s) => ({ ...s, peak: +s.peak.toFixed(2), ratio: +(s.peak / (cap / SPEED_TOL)).toFixed(2) })),
        peak: Math.max(0, ...[...speed.values()].map((s) => s.peak)) / (cap / SPEED_TOL),
        teleports, camera: { peak: +camPeak.toFixed(2), ratio: +(camPeak / (camCap / SPEED_TOL)).toFixed(2), over: camOver, teleports: camTele },
      }
    },
  }
}

// the passes the pipettes of the active station make: [{kind, ul}] (a pass = the tip from empty,
// filled, back to empty; its volume the most it held)
export function createPassTracker(line) {
  const passes = [], open = new Map(), over = []
  return {
    frame(k) {
      const st = line.stations()[line.active()]
      for (const pip of st.pips ? Object.values(st.pips) : st.pip ? [st.pip] : []) {
        const ul = pip.userData.tipUl != null ? pip.userData.tipUl : (pip.userData.drawnUl ? pip.userData.drawnUl() : 0)
        const kind = pip.userData.kind || 'P200', capUl = pip.userData.capacityUl || P200_UL
        if (ul > capUl + 0.5) over.push({ frame: k, kind, ul: +ul.toFixed(1), cap: capUl })
        const o = open.get(pip)
        if (ul > 0.01) { if (!o) open.set(pip, { kind, ul }); else o.ul = Math.max(o.ul, ul) }
        else if (o) { passes.push(o); open.delete(pip) }
      }
    },
    result() { return { passes: [...passes, ...open.values()].map((p) => ({ kind: p.kind, ul: +p.ul.toFixed(2) })), over: over.slice(0, 5), overCount: over.length } },
  }
}

// Run the ACTIVE station on the runner's own clock and check everything. `timed`: the step's
// countdown in seconds (Start is pressed once its vessels have arrived; a countdown over `fullTo`
// seconds runs its first and last 10 s and skips the middle — protocol time, not animation).
export async function checkStation(line, { timed = 0, fullTo = 60, tailSec = 2, maxSec = 600, every = 6, clockAdd, startTimer } = {}) {
  const fps = 60, tempo = animationTempo()
  const motion = createMotionTracker(line, { fps }), passes = createPassTracker(line)
  const liquid = []
  let prevL = null
  const arriving = () => { const S = line.sample(); return !!((S && S.vessels.some((v) => v.visible && v.userData.trip)) || line.preps().some((v) => v.visible && v.userData.trip)) }
  const pNow = () => +((window.__benchperf && window.__benchperf.p) || 0)
  let phase = timed ? 'rest' : 'run', restSince = null, settled = null, started = null, jumped = false
  const tail = Math.round(tailSec * tempo * fps)
  const found = await simulateStationAsync(line, { every, real: {
    maxFrames: Math.round(maxSec * fps),
    tick(k) {
      clockAdd(1000 / fps)
      if (phase === 'rest' && !arriving()) {
        if (restSince == null) restSince = k
        if (k - restSince > Math.round(1.5 * tempo * fps)) { startTimer(); phase = 'count'; started = k; return sleep(120) }
      }
      if (k % 30 === 0) return sleep(0)            // the runner's React state keeps up (running → done)
      if (phase === 'count' && !jumped && timed > fullTo && k - started > 10 * fps) {
        clockAdd((timed - 20) * 1000); jumped = true; motion.cut(); prevL = null; return 'cut'
      }
      return null
    },
    onFrame(k) {
      motion.frame(k); passes.frame(k)
      const cur = { k, p: pNow(), ...sampleLiquids(line) }
      if (prevL) for (const b of checkFrames([prevL, cur])) if (liquid.length < 40) liquid.push(b)
      prevL = cur
    },
    done(k) {
      if (phase === 'rest') return false
      const finished = pNow() >= 0.9999 && !arriving()
      if (!finished) { settled = null; return false }
      if (settled == null) settled = k
      return k - settled >= tail
    },
  } })
  const MOTION = ['teleport', 'abrupt-start', 'abrupt-stop']
  const collisions = found.filter((d) => !MOTION.includes(d.check))
  const motionAudit = found.filter((d) => MOTION.includes(d.check))
  return { liquid, ...motion.result(), collisions, motionAudit, ...{ pipette: passes.result() } }
}

export { sampleLiquids, checkBoundary }
