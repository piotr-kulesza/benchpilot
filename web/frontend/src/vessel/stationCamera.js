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
