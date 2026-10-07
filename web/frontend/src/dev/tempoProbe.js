// tempoProbe.js — DOES EVERY MOTION STRETCH WITH THE TEMPO? (scene/tempo.js)
//
// The live runner line is stepped on its OWN clock (no forced p) at tempo 1 and at
// ANIMATION_TEMPO. For every moving part of the active station, the sample's vessels and the
// preps, the CUMULATIVE PATH (position + rotation + scale change, summed frame by frame) is
// recorded. The tempo-1 run is cut into MOTION SEGMENTS (runs of frames in which the part moves);
// each segment is timed from 10 % to 90 % of its own path length — in both runs, at the SAME path
// levels (the paths are identical; only time may differ). Its duration at the slow tempo must be
// tempo × its duration at 1, ± 5 %. A motion that bypasses the tempo clock (its own fixed speed,
// a per-frame factor, a wall clock) keeps its duration → red.
// Timing by path level, interpolated between frames, makes the pairing immune to where frames
// fall: a near-pause that splits a move at one tempo and not at the other changes nothing.
import { Vector3 } from 'three'

export const EPS = 5e-5          // per tempo-1 sample (240 Hz): below this a part is at rest (units / rad)
export const GAP = 4             // tempo-1 samples of rest that do NOT end a segment
export const EDGE = 0.1          // a segment is timed from 10 % to 90 % of its path (an eased or exponential
                                 // tail is flat: a level there is no clock — a 1 % offset was 30 % of time)
export const MIN_PATH = 1e-3     // a segment shorter than this (units / rad) is not a motion
export const TOL = 0.05

// segments of a tempo-1 cumulative path: [{ start, end, frames }]
export function segmentsOf(cum) {
  const segs = []
  let cur = null, still = 0
  for (let k = 0; k < cum.length; k++) {
    const m = cum[k] - (k ? cum[k - 1] : 0)
    if (m > EPS) { if (!cur) cur = { start: k, end: k }; cur.end = k; still = 0 }
    else if (cur && ++still > GAP) { segs.push(cur); cur = null; still = 0 }
  }
  if (cur) segs.push(cur)
  return segs.map((s) => ({ ...s, frames: s.end - s.start + 1 }))
}
// the (fractional) frame at which the cumulative path first reaches `level`
export function timeAt(cum, level) {
  for (let k = 0; k < cum.length; k++) {
    if (cum[k] >= level) {
      const a = k ? cum[k - 1] : 0
      return k - 1 + (cum[k] - a > 0 ? (level - a) / (cum[k] - a) : 1)
    }
  }
  return null
}
export const cumOf = (mags) => { let c = 0; return mags.map((m) => (c += m)) }

// a: { path: cum } at tempo 1, b: { path: cum } at `tempo`. Returns rows and the bad ones.
export function compareRuns(a, b, tempo, tol = TOL) {
  const rows = []
  for (const path of Object.keys(a)) {
    const A = a[path], B = b[path] || []
    let i = 0
    for (const s of segmentsOf(A)) {
      const c0 = s.start ? A[s.start - 1] : 0, c1 = A[s.end], L = c1 - c0
      if (L < MIN_PATH) continue
      const l0 = c0 + EDGE * L, l1 = c1 - EDGE * L
      const t0 = timeAt(A, l0), t1 = timeAt(A, l1), u0 = timeAt(B, l0), u1 = timeAt(B, l1)
      const d1 = t1 - t0, dT = u0 != null && u1 != null ? u1 - u0 : null
      // an INSTANT change (inside one sample at tempo 1: a reparent, a seat snapped on entry) has no
      // duration to stretch — listed, not timed (a visible jump is the motion audit's teleport)
      if (d1 < 1) { rows.push({ path, i: i++, start1: s.start, f1: d1, fT: dT, ratio: null, instant: true, ok: dT != null && dT < tempo, why: dT != null && dT < tempo ? '' : 'an instant change that is not instant at the slow tempo' }); continue }
      const ratio = dT != null && d1 > 0 ? dT / d1 : null
      const ok = ratio != null && Math.abs(ratio / tempo - 1) <= tol
      rows.push({ path, i: i++, start1: s.start, f1: d1, fT: dT, startT: u0, ratio, ok,
        why: ok ? '' : ratio == null ? 'the slow run never makes this motion' : `ratio ${ratio.toFixed(3)} (want ${tempo} ± ${tol * 100} %)` })
    }
  }
  // a part that moves only at the slow tempo
  for (const path of Object.keys(b)) if (!a[path] && b[path].length && b[path][b[path].length - 1] >= MIN_PATH)
    rows.push({ path, i: 0, f1: null, fT: null, ratio: null, ok: false, why: 'moves only at the slow tempo' })
  return { rows, bad: rows.filter((r) => !r.ok) }
}

// ── in the page ──
const skip = (o, st) => o.isSprite || o.isLight || (st && (o === st.label || o === st.dial))
const nameOf = (o) => (o.userData && o.userData.builder ? o.userData.builder.replace(/^build/, '') : o.name || o.type)
// every part to watch: [path, node]. Roots: the active station's objects, the sample, the preps.
export function trackedParts(line) {
  const st = line.stations()[line.active()]
  const role = new Map()
  if (st.pip) role.set(st.pip, 'pipette')
  if (st.cen) role.set(st.cen, 'centrifuge')
  if (st.dev) role.set(st.dev, 'instrument')
  for (const [k, r] of Object.entries(st.reagents || {})) if (r && r.grp) role.set(r.grp, `bottle ${k}`)
  if (st.waste) role.set(st.waste, 'waste')
  const roots = []
  st.group.children.forEach((c, i) => { if (!skip(c, st)) roots.push([role.get(c) || `${nameOf(c)}#${i}`, c]) })
  const S = line.sample()
  if (S) S.vessels.forEach((v, k) => roots.push([`sample ${nameOf(v)}#${k}`, v]))
  line.preps().forEach((v, k) => roots.push([`prep#${k}`, v]))
  const out = [], seen = new Set()
  for (const [name, root] of roots) {
    const walk = (o, path) => {
      if (seen.has(o) || skip(o, st)) return
      seen.add(o); out.push([path, o])
      o.children.forEach((c, j) => walk(c, `${path}/${c.name || c.type}${j}`))
    }
    walk(root, name)
  }
  return out
}
const _v = new Vector3()
// step the line `frames` frames of dt on the runner's own clock (`tick(k)` first: advance a page
// clock) and extend each moving part's cumulative path in `track` (Map path → number[]).
export function recordLine(line, { frames, dt = 1 / 60, tick = null, track = new Map() }) {
  const parts = trackedParts(line)
  const base = track.frames || 0
  const prev = new Map()
  for (const [path, o] of parts) prev.set(path, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() })
  line.hold = true; line.pForce = null
  for (let k = 0; k < frames; k++) {
    if (tick) tick(k)
    line.step(dt)
    for (const [path, o] of parts) {
      const a = prev.get(path)
      const m = o.position.distanceTo(a.p) + a.q.angleTo(o.quaternion) + _v.copy(o.scale).sub(a.s).length()
      a.p.copy(o.position); a.q.copy(o.quaternion); a.s.copy(o.scale)
      let c = track.get(path)
      if (!c) { if (!(m > 0)) continue; c = new Array(base + k).fill(0); track.set(path, c) }
      while (c.length < base + k) c.push(c.length ? c[c.length - 1] : 0)
      c.push((c.length ? c[c.length - 1] : 0) + m)
    }
  }
  track.frames = base + frames
  return track
}
export function finish(track) {
  const out = {}
  for (const [path, c] of track) {
    while (c.length < track.frames) c.push(c[c.length - 1])
    if (c[c.length - 1] >= MIN_PATH) out[path] = c.map((x) => +x.toFixed(6))
  }
  return out
}
