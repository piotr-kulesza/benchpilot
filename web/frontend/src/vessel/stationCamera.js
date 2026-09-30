import { Vector3, PerspectiveCamera } from 'three'
// stationCamera.js — THE camera pose for a station, as a pure function of its measured
// frame (and the step's push), so the runner's frame loop and the headless visibility
// audit compute the SAME camera. The camera only moves and zooms; it never rescales.
export const CAM = {
  FOV: 40,
  RAIL_Y: 3.35,
  RAIL_Z: 9.6,
  LOOK_Y: 1.05,
  // R_REF: the content radius the demo's fixed distance frames comfortably; larger rigs
  // back the camera off gently, nothing zooms IN past it.
  R_REF: 3.0,
  // the runner's 3D panel at the reference layout (1440 × 900 window: 934 × 826 px)
  ASPECT: 934 / 826,
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t

// frame: { center:{x,y,z}, radius } (station-local); railX: the station's world x.
// sway: the gentle lateral drift (seconds of scene time), omitted by the audit.
export function cameraPose(frame, { railX = 0, time = null, push = 0, pushTarget = null } = {}) {
  const f = frame
  if (f.dist != null) {            // a frame fitted to its subject (fitFrame)
    const d = f.dist, sway = time == null ? 0 : Math.sin(time * 0.15) * 0.012 * d
    const e = CAM.RAIL_Y - CAM.LOOK_Y, n = Math.hypot(e, CAM.RAIL_Z)
    const cx = railX + f.center.x + sway
    return { pos: [cx, f.center.y + (e / n) * d, f.center.z + (CAM.RAIL_Z / n) * d], look: [cx, f.center.y, f.center.z], fov: CAM.FOV }
  }
  const fit = clamp(f.radius / CAM.R_REF, 1, 1.7) // back off only for oversized rigs
  const cx = railX + f.center.x + (time == null ? 0 : Math.sin(time * 0.15) * 0.12)
  let px = cx, py = f.center.y + (CAM.RAIL_Y - CAM.LOOK_Y) * fit, pz = f.center.z + CAM.RAIL_Z * fit
  let lx = cx, ly = f.center.y, lz = f.center.z
  // per-station camera PUSH, blended in with the step's progress
  if (push > 0 && pushTarget) {
    const t = pushTarget
    px = lerp(px, railX + t.pos[0], push); py = lerp(py, t.pos[1], push); pz = lerp(pz, t.pos[2], push)
    lx = lerp(lx, railX + t.look[0], push); ly = lerp(ly, t.look[1], push); lz = lerp(lz, t.look[2], push)
  }
  return { pos: [px, py, pz], look: [lx, ly, lz], fov: CAM.FOV }
}

// ── FRAME FROM THE SUBJECT ─────────────────────────────────────────────────────────────
// The camera keeps the demo's rail direction (the same elevation, always looking along −z)
// and chooses only WHERE it looks and HOW FAR back it stands:
//  1. the SUBJECT and the props the step USES (its sources, its waste, a second vessel)
//     must be whole and inside the safe area;
//  2. the subject must not fill more than MACRO of the frame height (a tube is not a macro
//     shot);
//  3. the rest of the station (the instrument the subject sits in) is shown only as far as
//     the subject stays ≥ LEGIBLE of the frame — a 41 mm tube in a 700 mm freezer frames
//     the cavity, not the whole freezer.

export const FRAMING = {
  FIT: { x: 0.82, top: 0.7, bottom: -0.82 }, // NDC box the framed content must stay inside (inside the safe area)
  MACRO: 1.1,    // subject's projected height ≤ 55 % of the frame (NDC span of 2)
  LEGIBLE: 0.025, // widen to the context only while the subject keeps ≥ 2.5 % of the frame
}
const DIR = new Vector3(0, CAM.RAIL_Y - CAM.LOOK_Y, CAM.RAIL_Z).normalize()
const _cam = new PerspectiveCamera(CAM.FOV, CAM.ASPECT, 0.1, 400)
const _p = new Vector3()
function place(c, d) { _cam.position.copy(c).addScaledVector(DIR, d); _cam.lookAt(c); _cam.updateMatrixWorld(true); _cam.updateProjectionMatrix() }
function corners(b) { const o = []; for (let i = 0; i < 8; i++) o.push(new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)); return o }
function ndcBox(b, c, d) {
  place(c, d)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const k of corners(b)) { _p.copy(k).project(_cam); x0 = Math.min(x0, _p.x); x1 = Math.max(x1, _p.x); y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y) }
  return { x0, x1, y0, y1 }
}
const fits = (b, c, d) => { const n = ndcBox(b, c, d); return n.x0 >= -FRAMING.FIT.x && n.x1 <= FRAMING.FIT.x && n.y0 >= FRAMING.FIT.bottom && n.y1 <= FRAMING.FIT.top }
const area = (b, c, d) => { const n = ndcBox(b, c, d); const w = Math.min(1, n.x1) - Math.max(-1, n.x0), h = Math.min(1, n.y1) - Math.max(-1, n.y0); return w > 0 && h > 0 ? (w * h) / 4 : 0 }
// the smallest distance at which pred holds (pred is monotone in d)
function minDist(pred) { let lo = 0.05, hi = 200; if (!pred(hi)) return hi; for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (pred(m)) hi = m; else lo = m } return hi }
function maxDist(pred) { let lo = 0.05, hi = 200; if (!pred(lo)) return lo; for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (pred(m)) lo = m; else hi = m } return lo }

// subject, used, context: Box3 (station-local). Returns the frame { center, dist, … }.
export function fitFrame(subject, used, context) {
  const cU = used.getCenter(new Vector3())
  const dU = minDist((d) => fits(used, cU, d))
  const macro = (c) => minDist((d) => { const n = ndcBox(subject, c, d); return n.y1 - n.y0 <= FRAMING.MACRO })
  const cC = context.getCenter(new Vector3())
  const dC = minDist((d) => fits(context, cC, d))
  let center, dist
  if (area(subject, cC, Math.max(dC, macro(cC))) >= FRAMING.LEGIBLE) { center = cC; dist = Math.max(dC, macro(cC)) }
  else {
    center = cU
    const dLeg = maxDist((d) => area(subject, cU, d) >= FRAMING.LEGIBLE)  // widest view that keeps it legible
    dist = Math.max(dU, macro(cU), Math.min(dLeg, dC))
  }
  return { center, dist, subjectBox: subject.clone(), usedBox: used.clone(), radius: dist / 9.87 * CAM.R_REF }
}
