// collisionDriver.js — drive the LIVE runner line through one step, frame by frame, and run
// the collision audit (collisionAudit.js) on what is there. Loaded in the page by
// scripts/collision-audit.mjs; needs the dev hook window.__benchLine (StationScene.jsx).
//
// The live frame loop is held; the driver calls the SAME frame function with a fixed dt and
// the step's progress p forced to rise over the step's window (6.5 s), then lets the sample
// finish its glide. So the audit sees the trajectories a viewer sees — the sample's glide lag,
// a lid easing shut — not a set of snapped poses.
import { auditPose, isSolid, setPenetration, TOL } from './collisionAudit.js'
import { auditTrack } from './motionAudit.js'
import { Vector3, Quaternion } from 'three'

const visible = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }
const builderOf = (o) => (o.userData && o.userData.builder ? o.userData.builder.replace(/^build/, '') : null)

// the objects on station `st` (and, prefixed, on the station the sample comes from)
export function stationObjects(line, st, prefix = '') {
  const role = new Map()
  for (const [k, r] of Object.entries(st.reagents || {})) if (r && r.grp) role.set(r.grp, `source ${k}`)
  if (st.dev) role.set(st.dev, 'instrument')
  if (st.cen) role.set(st.cen, 'centrifuge')
  if (st.pip) role.set(st.pip, 'pipette')
  if (st.prep) role.set(st.prep, 'prep')
  const out = []
  st.group.children.forEach((c, i) => {
    if (c.isSprite || c.isLight || c === st.label || c === st.dial || !visible(c)) return
    const b = builderOf(c), r = role.get(c)
    const name = r ? `${r}${b ? ` (${b})` : ''}` : (b || c.name || `${c.type}#${i}`)
    out.push({ name: prefix + name, root: c, held: c === st.pip })
  })
  return out
}
export function lineObjects(line) {
  const stations = line.stations(), a = line.active()
  const out = stationObjects(line, stations[a])
  if (a > 0) out.push(...stationObjects(line, stations[a - 1], 'prev · '))
  const S = line.sample()
  if (S) S.vessels.forEach((v, k) => { if (visible(v)) out.push({ name: `sample ${builderOf(v) || k}`, root: v, held: false }) })
  for (const pv of line.preps()) if (visible(pv) && !out.some((o) => o.root === pv)) out.push({ name: `prep ${builderOf(pv) || ''}`.trim(), root: pv, held: false })
  return out
}

// MOTION TRACKS of the active station's things, every frame: each object's root in the world
// (does it travel, or jump?), and each pivot GROUP directly under a root — a lid, a door, an
// arm — by its rotation relative to the object (does it swing eased?)
function motionCandidates(line) {
  const stations = line.stations(), st = stations[line.active()]
  const named = stationObjects(line, st)
  const roots = st.group.children.filter((c) => !c.isSprite && !c.isLight && c !== st.label && c !== st.dial)
  const out = roots.map((c) => ({ key: c, name: (named.find((o) => o.root === c) || {}).name || builderOf(c) || c.type, root: c }))
  const S = line.sample()
  if (S) S.vessels.forEach((v, k) => out.push({ key: v, name: `sample ${builderOf(v) || k}`, root: v }))
  for (const pv of line.preps()) out.push({ key: pv, name: `prep ${builderOf(pv) || ''}`.trim(), root: pv })
  return out
}
const _p = new Vector3(), _q = new Quaternion(), _s = new Vector3()
// only a thing with a SOLID can teleport (a stream starting, steam rising, a liquid level is
// not a thing changing place)
const hasSolid = (root) => { let y = false; root.traverse((o) => { if (!y && isSolid(o)) y = true }); return y }
function recordMotion(line, tracks) {
  for (const c of motionCandidates(line)) {
    if (!hasSolid(c.root)) continue
    c.root.updateWorldMatrix(true, false)
    c.root.matrixWorld.decompose(_p, _q, _s)
    let t = tracks.get(c.key)
    if (!t) { t = { name: c.name, kind: 'object', track: [], start: tracks.frame }; tracks.set(c.key, t) }
    t.track.push({ pos: _p.toArray(), quat: _q.toArray(), visible: visible(c.root) })
    for (const g of c.root.children) {
      if (!g.isGroup || !g.children.length) continue
      const pk = 'part:' + g.uuid   // a part's own key: a vessel nested in another is also an object
      let tp = tracks.get(pk)
      if (!tp) { tp = { name: `${c.name} · part`, kind: 'part', track: [], start: tracks.frame }; tracks.set(pk, tp) }
      tp.track.push({ pos: [0, 0, 0], quat: g.quaternion.toArray(), visible: visible(g) })
    }
  }
}

// run the active station's step: `frames` frames at 1/60 s, p = frame / (stepDur·60);
// audit every `every` frames. Returns the distinct defects (worst depth, first p seen) —
// collisions and motion.
// FINISH the station on screen (the one before the audited step): p = 1, then let everything
// settle — a viewer presses Next after a step is done (a timed one after its countdown)
export function finishStation(line, seconds = 2.5) {
  line.hold = true
  line.pForce = 1
  for (let k = 0; k < Math.round(seconds * 60); k++) line.step(1 / 60)
}

// A TIMED step waits at p = 0 until Start is pressed (the runner holds the countdown): `hold`
// seconds of that rest are run first — what the viewer sees while reading the step.
const arriving = (line) => { const S = line.sample(); return !!((S && S.vessels.some((v) => v.visible && v.userData.trip)) || line.preps().some((v) => v.visible && v.userData.trip)) }
// stopAt: stop after that frame (the step is left posed there — for an evidence snapshot)
export function simulateStation(line, { stepDur = 6.5, tail = 1.5, every = 3, benchY = 0, hold = 0, stopAt = null } = {}) {
  const fps = 60, H = Math.round(hold * fps), total = H + Math.round((stepDur + tail) * fps)
  const seen = new Map()
  const tracks = new Map(); tracks.frame = 0
  let prev = null, run = 0
  line.hold = true
  try {
    for (let k = 0; k <= total; k++) {
      // during a timed step's REST the runner's own logic runs (the countdown not started:
      // driveTimed's rest — what the viewer sees before Start); then p is driven
      // (and, as the runner does, the step's clock waits while a vessel is still arriving)
      if (k >= H && !arriving(line)) run++
      line.pForce = k < H ? null : Math.min(1, run / (stepDur * fps))
      line.step(1 / fps)
      tracks.frame = k; recordMotion(line, tracks)
      if (stopAt != null && k >= stopAt) break
      if (k % every) continue
      const { defects, state } = auditPose(lineObjects(line), { benchY, prev, frame: k })
      prev = state
      for (const d of defects) {
        const key = `${d.check}|${d.a}|${d.b}`
        const was = seen.get(key)
        const keep = (x) => { if (d.parts) Object.defineProperty(x, 'parts', { value: d.parts, enumerable: false, configurable: true, writable: true }); return x }
        if (!was) seen.set(key, keep({ ...d, p: +(line.pForce || 0).toFixed(3), pLast: +(line.pForce || 0).toFixed(3), frames: 1, frame: k }))
        else { was.frames++; was.pLast = +(line.pForce || 0).toFixed(3); if (d.depth > was.depth) { Object.assign(was, d, { p: was.p, pLast: was.pLast, frames: was.frames, frame: was.frame }); keep(was); was.pWorst = +(line.pForce || 0).toFixed(3); was.frameWorst = k } }
      }
    }
  } finally { line.pForce = null }
  // a moving part against its FINAL rest pose too (a cap that opens on the first frame was
  // never seen closed until the end): red only if it went deeper than it rests, either end
  for (const [key, d] of seen) {
    if (!d.parts) continue
    const atEnd = setPenetration(d.parts.movingParts, d.parts.rest).depth
    if (d.parts.depth <= Math.max(d.d0 || 0, atEnd) + TOL.depth) seen.delete(key)
  }
  // motion: judged over the whole window (the sample's arrival glide included)
  for (const t of tracks.values()) {
    if (t.track.length < 3) continue
    for (const f of auditTrack(t.track, { kind: t.kind, restBefore: t.start === 0 })) {
      const key = `${f.check}|${t.name}|${f.how}`
      if (!seen.has(key)) seen.set(key, { check: f.check, a: t.name, b: f.how, depth: f.peak || 0, p: +Math.min(1, Math.max(0, t.start + f.frame - H) / (stepDur * fps)).toFixed(3), frame: t.start + f.frame, frames: 1 })
    }
  }
  return [...seen.values()]
}
