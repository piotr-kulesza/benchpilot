// tripEase.js — the TIMING of a vessel's trip to the next station (its path is the same as ever: out of a
// dock straight up to its exitLift, then straight to its seat). Pure — no DOM.
import { TRANSITION_DURATION, TRANSITION_PER_UNIT, TRANSITION_FREE_UNITS, TRANSITION_MAX } from './tempo.js'

// seconds on screen for a way of `len` units
export function transitionSeconds(len) {
  return Math.min(TRANSITION_MAX, TRANSITION_DURATION + TRANSITION_PER_UNIT * Math.max(0, len - TRANSITION_FREE_UNITS))
}

// share of the way at share u of the time: the speed ramps up smoothly over the first RAMP (a smoothstep of
// speed — no jump in acceleration), holds even through the middle, and ramps down over the last RAMP
const RAMP = 0.3, VMAX = 1 / (1 - RAMP)
const ramp = (x) => x * x * x - x * x * x * x / 2          // ∫ smoothstep: the way covered on a ramp of length 1
export function tripEase(u) {
  if (!(u > 0)) return 0
  if (u >= 1) return 1
  if (u < RAMP) return VMAX * RAMP * ramp(u / RAMP)
  if (u > 1 - RAMP) return 1 - VMAX * RAMP * ramp((1 - u) / RAMP)
  return VMAX * (RAMP / 2 + u - RAMP)
}

// the polyline's length
export function pathLength(pts) {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z)
  return L
}
// the point at arc length s along the polyline, into `out` (a Vector3)
export function pointAlong(pts, s, out) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    if (s <= d && d > 0) { const t = s / d; return out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t) }
    s -= d
  }
  const e = pts[pts.length - 1]
  return out.set(e.x, e.y, e.z)
}
