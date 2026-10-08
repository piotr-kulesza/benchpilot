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
//   draws     one draw per substance a step adds (one pipette, schematic: whatever its volume), one
//             per discard or move — never portions
//   tempo     per station, the pipette's peak descent and move speeds (phaseSpeeds): one tempo for
//             every station — their spread across stations is checked by scripts/check-protocol.mjs
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

// ── pure ──
// the draws a stated pipette move takes: ONE, whatever its volume (schematic pipetting)
export function passesFor(ul) { return ul > 0 ? [{ ul }] : [] }
// expected draws vs the draws seen (both [{ul}]), in order; volumes to 1 %
export function comparePasses(expected, seen) {
  const bad = []
  const n = Math.max(expected.length, seen.length)
  for (let i = 0; i < n; i++) {
    const e = expected[i], s = seen[i]
    if (!s) { bad.push(`draw ${i + 1}: expected ${fmt(e.ul)}, none seen`); continue }
    if (!e) { bad.push(`draw ${i + 1}: ${fmt(s.ul)} not called for`); continue }
    if (Math.abs(e.ul - s.ul) > Math.max(0.5, 0.01 * e.ul)) bad.push(`draw ${i + 1}: drew ${fmt(s.ul)}, expected ${fmt(e.ul)}`)
  }
  return bad
}
// a pipette's peak speed per kind of motion (u/s) from its track [{phase, x, y, z, dt}]: the DESCENT
// (into the source, into the vessel) and the MOVES (to the source, the carry, home); a frame's
// displacement counts toward the phase it arrives in
const DESCENT = new Set(['descent', 'into source']), MOVE = new Set(['to source', 'travel', 'return'])
export function phaseSpeeds(track) {
  const out = { descent: 0, move: 0 }
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i]
    if (!(b.dt > 0)) continue
    const v = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / b.dt
    if (DESCENT.has(b.phase)) out.descent = Math.max(out.descent, v)
    else if (MOVE.has(b.phase)) out.move = Math.max(out.move, v)
  }
  return out
}
const fmt = (ul) => (ul >= 1000 ? `${+(ul / 1000).toFixed(3)} mL` : `${+ul.toFixed(1)} µl`)
// one frame's displacement d[k] among its neighbours: an isolated jump?
// when a station's run is over: its OWN p has been seen below 1 (on entry the page still reads the
// last station's p = 1 — taken as the end, stations were checked to p 0.73) and then held at 1, nothing
// arriving, for `tail` frames
export function createFinish(tail) {
  let low = false, since = null
  const f = (k, p, arriving) => {
    if (p < 0.9999) low = f.ran = true
    if (!low || p < 0.9999 || arriving) { since = null; return false }
    if (since == null) since = k
    return k - since >= tail
  }
  f.ran = false   // its p was ever below 1 (a clock left 'done' by the last step never runs)
  return f
}
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
  if (mesh.isInstancedMesh && !mesh.boundingBox) mesh.computeBoundingBox()
  if (!g.boundingBox) g.computeBoundingBox()
  const b = mesh.isInstancedMesh ? mesh.boundingBox : g.boundingBox
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
  let cam = null, camPeak = 0, camOver = 0, camD = [0, 0], camPeakFrame = null, camTrace = [], camPeakTrace = null
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
        // (a mesh whose world matrix has not changed has not moved: no corners to compute)
        const me = mesh.matrixWorld.elements
        if (e && !e.hidden && e.m && me.every((x, i) => x === e.m[i])) { if (isolatedJump(e.d[0], e.d[1], 0)) teleports.push({ frame: k - 1, object: label, kind: 'jump', dist: +e.d[1].toFixed(3) }); e.d = [e.d[1], 0]; continue }
        const pts = corners(mesh, [])
        if (!e) { st.set(mesh, { pts, d: [0, 0], label, m: me.slice() }); continue }
        e.m = me.slice()
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
        camTrace.push([k, +p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]); if (camTrace.length > 9) camTrace.shift()
        if (camPeakFrame === k - 4) camPeakTrace = camTrace.slice()
        if (cam) {
          const d = p.distanceTo(cam)
          if (isolatedJump(camD[0], camD[1], d, 0.5)) camTele.push({ frame: k - 1, dist: +camD[1].toFixed(3) })
          camD = [camD[1], d]
          const v = d * fps; if (v > camPeak) { camPeak = v; camPeakFrame = k } if (v > camCap) camOver++
        }
        cam = p
      }
    },
    // a cut (protocol time skipped): what moved meanwhile is not a jump — tracking starts over
    cut() { st.clear(); cam = null; camD = [0, 0] },
    result() {
      return {
        speed: [...speed.values()].filter((s) => s.over).map((s) => ({ ...s, peak: +s.peak.toFixed(2), ratio: +(s.peak / (cap / SPEED_TOL)).toFixed(2) })),
        peak: Math.max(0, ...[...speed.values()].map((s) => s.peak)) / (cap / SPEED_TOL),
        teleports, camera: { peak: +camPeak.toFixed(2), ratio: +(camPeak / (camCap / SPEED_TOL)).toFixed(2), over: camOver, peakFrame: camPeakFrame, trace: camPeakTrace, teleports: camTele },
      }
    },
  }
}

// the passes the pipettes of the active station make: [{kind, ul}] (a pass = the tip from empty,
// filled, back to empty; its volume the most it held)
export function createPassTracker(line) {
  const passes = [], open = new Map()
  return {
    frame(k) {
      const st = line.stations()[line.active()]
      for (const pip of st.pips ? Object.values(st.pips) : st.pip ? [st.pip] : []) {
        const ul = pip.userData.tipUl != null ? pip.userData.tipUl : (pip.userData.drawnUl ? pip.userData.drawnUl() : 0)
        const o = open.get(pip)
        if (ul > 0.01) { if (!o) open.set(pip, { ul }); else o.ul = Math.max(o.ul, ul) }
        else if (o) { passes.push(o); open.delete(pip) }
      }
    },
    result() { return { passes: [...passes, ...open.values()].map((p) => ({ ul: +p.ul.toFixed(2) })) } },
  }
}
// the ACTIVE station's pipette, frame by frame (world, the frame's dt): its peak descent and move speeds
export function createPhaseTracker(line, { fps = 60 } = {}) {
  const track = [], w = new Vector3()
  return {
    frame() {
      const st = line.stations()[line.active()], pip = st && st.pip
      if (!pip) return
      pip.getWorldPosition(w)
      track.push({ phase: pip.userData.phase || 'home', x: w.x, y: w.y, z: w.z, dt: 1 / fps })
    },
    result() { const s = phaseSpeeds(track); return { descent: +s.descent.toFixed(3), move: +s.move.toFixed(3) } },
  }
}

// Run the ACTIVE station on the runner's own clock and check everything. `timed`: the step's
// countdown in seconds (Start is pressed once its vessels have arrived; a countdown over `fullTo`
// seconds runs its first and last 10 s and skips the middle — protocol time, not animation).
export async function checkStation(line, { timed = 0, fullTo = 20, tailSec = 2, maxSec = 240, every = 8, clockAdd, startTimer } = {}) {
  const fps = 60, tempo = animationTempo()
  const motion = createMotionTracker(line, { fps }), passes = createPassTracker(line), phases = createPhaseTracker(line, { fps })
  const liquid = []
  let prevL = null
  const arriving = () => { const S = line.sample(); return !!((S && S.vessels.some((v) => v.visible && v.userData.trip)) || line.preps().some((v) => v.visible && v.userData.trip)) }
  const pNow = () => +((window.__benchperf && window.__benchperf.p) || 0)
  let phase = timed ? 'rest' : 'run', restSince = null, settled = null, started = null, jumped = false
  const tail = Math.round(tailSec * tempo * fps), finish = createFinish(tail)
  // long enough for the station's own paced run (25 P1000 passes run past 240 s; cut there, a station
  // was checked to p 0.73 and passed)
  const act = line.stations()[line.active()]
  const runSec = Math.max(maxSec, (act && act.duration ? act.duration * tempo : 0) + (timed ? 60 : 0) + 30)
  const found = await simulateStationAsync(line, { every, real: {
    maxFrames: Math.round(runSec * fps),
    tick(k) {
      clockAdd(1000 / fps)
      if (phase === 'rest' && !arriving()) {
        if (restSince == null) restSince = k
        if (k - restSince > Math.round(1.5 * tempo * fps)) { startTimer(); phase = 'count'; started = k; return sleep(120) }
      }
      if (k % 30 === 0) return sleep(0)            // the runner's React state keeps up (running → done)
      // a countdown that has not moved 2 s after Start was not started (the click missed): press it again
      if (phase === 'count' && k - started === 2 * fps && pNow() <= 0) { startTimer(); started = k; return sleep(120) }
      if (phase === 'count' && !jumped && timed > fullTo && k - started > 10 * fps) {
        clockAdd((timed - 20) * 1000); jumped = true; motion.cut(); prevL = null; return 'cut'
      }
      return null
    },
    onFrame(k) {
      if (window.__traceSpin && line.stations()[line.active()].cen) { const c = line.stations()[line.active()].cen, S = line.sample(); (window.__spinTrace || (window.__spinTrace = [])).push([k, +c.userData.st.spin.toFixed(3), S.column && S.column.userData.drawnUl ? +S.column.userData.drawnUl().toFixed(1) : null, +((window.__benchperf && window.__benchperf.p) || 0).toFixed(3), !!(S.column && S.column.userData.docked)]) }
      motion.frame(k); passes.frame(k); phases.frame(k)
      const cur = { k, p: pNow(), ...sampleLiquids(line) }
      if (prevL) for (const b of checkFrames([prevL, cur])) if (liquid.length < 40) liquid.push(b)
      prevL = cur
    },
    done(k) {
      if (phase === 'rest') return false
      return finish(k, pNow(), arriving())
    },
  } })
  const MOTION = ['teleport', 'abrupt-start', 'abrupt-stop']
  const collisions = found.filter((d) => !MOTION.includes(d.check))
  const motionAudit = found.filter((d) => MOTION.includes(d.check))
  const pEnd = pNow()
  return { liquid, ...motion.result(), collisions, motionAudit, ...{ pipette: passes.result() }, phaseSpeeds: phases.result(), unfinished: pEnd < 0.9999 || !finish.ran ? +pEnd.toFixed(3) : null }
}

export { sampleLiquids, checkBoundary }
