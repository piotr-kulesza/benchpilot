// visibilityAudit.js — LEGIBILITY AS A CHECK. Each station declares its SUBJECT (the vessel
// or object the step acts on, st.subject()). Seen through the station's own camera
// (stationCamera.js — the one the runner uses) at the reference panel aspect:
//
//  area      — the subject's projected screen-space bounding box covers ≥ MIN_AREA of the
//              frame (it is not a speck; an absent subject has area 0)
//  occlusion — ≤ MAX_OCCLUDED of the subject's in-frame sample points are hidden behind
//              something OPAQUE (glass, water and a cutaway wall are see-through)
//  safeArea  — the subject's centre projects inside the safe area: clear of the frame
//              edges and of the top HUD band
//  dominance — the subject is the LARGEST object in frame: no rival's in-frame projected
//              box is bigger than the subject's. Rivals are the other spec'd objects on
//              the station (sources, bottles, other vessels, props). Not rivals: the
//              subject's own holder chain (rack, block, bath, rotor — it sits IN them),
//              the step's instrument, and held tools (offBench: pipette, syringe). A
//              source may be partly out of frame — only its in-frame part counts.
// Pure three.js; no DOM, no renderer.
import { PerspectiveCamera, Vector3, Raycaster, DoubleSide, Box3 } from 'three'
import { solidMeshes } from './solids.js'
import { cameraPose, CAM } from '../vessel/stationCamera.js'

export const VIS = {
  // 1 % passed tiles that were plainly unreadable (a tube in an ice bucket at 2.2 % reads
  // as a speck); a tube that reads as the step's subject covers ≥ ~4 % of the frame
  MIN_AREA: 0.04,
  MAX_OCCLUDED: 0.25,
  // NDC (−1..1): 7.5 % margin at the sides and bottom; the top 12.5 % is the HUD band
  SAFE: { x: 0.85, top: 0.75, bottom: -0.85 },
  // a material below this opacity is see-through (glass 0.24, water 0.36, a cutaway wall)
  OPAQUE: 0.6,
  SAMPLES: 64,
}

export function makeCamera(pose, aspect = CAM.ASPECT) {
  const cam = new PerspectiveCamera(pose.fov, aspect, 0.1, 260)
  cam.position.set(...pose.pos)
  cam.lookAt(...pose.look)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

function shown(o) { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }
function inSubtree(o, root) { for (let n = o; n; n = n.parent) if (n === root) return true; return false }
export function isOpaque(obj) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
  // see-through: a low-opacity material, or an ALPHA-TEXTURED decal (a printed graduation:
  // opacity 1, but its texture is clear except for the marks)
  return mats.some((m) => m && m.visible !== false && !(m.transparent && (m.opacity < VIS.OPAQUE || m.map)))
}

const _v = new Vector3()
function subjectPoints(subject) {
  const pts = []
  for (const m of solidMeshes(subject)) {
    if (m.isInstancedMesh) continue
    const pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) pts.push(_v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone())
  }
  return pts
}

// the object's projected screen-space bounding box, clipped to the frame, as a fraction of it
export function projectedArea(cam, pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    const q = p.clone().project(cam)
    if (q.z > 1 || q.z < -1) continue
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y)
  }
  const cx0 = Math.max(-1, minX), cx1 = Math.min(1, maxX), cy0 = Math.max(-1, minY), cy1 = Math.min(1, maxY)
  return cx1 > cx0 && cy1 > cy0 ? ((cx1 - cx0) * (cy1 - cy0)) / 4 : 0
}

// subject: an Object3D; occluderRoots: every other thing in the scene (station group,
// other vessels, preps). Returns the defects (possibly several) at this camera.
// rivals: the objects that must not out-size the subject in frame (see `dominance`).
export function visibilityDefects(cam, subject, occluderRoots, rivals = []) {
  const out = []
  if (!subject || !shown(subject)) return [{ check: 'area', kind: 'absent', area: 0 }]
  subject.updateWorldMatrix(true, true)
  const pts = subjectPoints(subject)
  if (!pts.length) return [{ check: 'area', kind: 'absent', area: 0 }]
  // area: the screen-space bounding box of the projected subject, clipped to the frame
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const inFrame = []
  for (const p of pts) {
    const q = p.clone().project(cam)
    if (q.z > 1 || q.z < -1) continue
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y)
    if (Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1) inFrame.push(p)
  }
  const cx0 = Math.max(-1, minX), cx1 = Math.min(1, maxX), cy0 = Math.max(-1, minY), cy1 = Math.min(1, maxY)
  const area = cx1 > cx0 && cy1 > cy0 ? ((cx1 - cx0) * (cy1 - cy0)) / 4 : 0
  if (area < VIS.MIN_AREA) out.push({ check: 'area', kind: area === 0 ? 'out-of-frame' : 'too-small', area: +area.toFixed(4) })
  // dominance: nothing the step does not act on out-sizes the subject in frame
  let big = null
  for (const r of rivals) {
    if (!r || r === subject || !shown(r)) continue
    r.updateWorldMatrix(true, true)
    const a = projectedArea(cam, subjectPoints(r))
    if (a > area && (!big || a > big.area)) big = { by: r.userData?.spec || r.name || r.type, area: a }
  }
  if (big) out.push({ check: 'dominance', kind: 'out-sized', area: +area.toFixed(4), by: big.by, rivalArea: +big.area.toFixed(4) })
  // safe area: the centre of the subject's bounding box
  const c = new Box3().setFromPoints(pts).getCenter(new Vector3()).project(cam)
  if (Math.abs(c.x) > VIS.SAFE.x || c.y > VIS.SAFE.top || c.y < VIS.SAFE.bottom) out.push({ check: 'safeArea', kind: c.y > VIS.SAFE.top ? 'under-hud' : 'at-edge', ndc: [+c.x.toFixed(3), +c.y.toFixed(3)] })
  // occlusion: rays from the camera to sample points of the subject that are in frame
  if (inFrame.length) {
    const occ = []
    for (const r of occluderRoots) r && r.traverse((o) => { if ((o.isMesh || o.isSprite) && !inSubtree(o, subject) && shown(o) && isOpaque(o)) occ.push(o) })
    const step = Math.max(1, Math.floor(inFrame.length / VIS.SAMPLES))
    const sample = inFrame.filter((_, k) => k % step === 0)
    const ray = new Raycaster(); ray.camera = cam
    const saved = occ.filter((o) => o.isMesh).map((o) => { const arr = Array.isArray(o.material) ? o.material : [o.material]; const s = arr.map((a) => a && a.side); arr.forEach((a) => { if (a) a.side = DoubleSide }); return [arr, s] })
    let blocked = 0, blocker = null, blockAt = null
    for (const p of sample) {
      const d = p.distanceTo(cam.position)
      ray.set(cam.position, p.clone().sub(cam.position).normalize()); ray.far = d - 1e-3
      const h = ray.intersectObjects(occ, false)
      if (h.length) { blocked++; if (!blocker) { blocker = h[0].object; blockAt = h[0].point } }
    }
    saved.forEach(([arr, s]) => arr.forEach((a, i) => { if (a) a.side = s[i] }))
    const frac = blocked / sample.length
    if (frac > VIS.MAX_OCCLUDED) { const d = { check: 'occlusion', kind: 'hidden', fraction: +frac.toFixed(3), by: ownerName(blocker), at: blockAt && blockAt.toArray().map((n) => +n.toFixed(2)) }; Object.defineProperty(d, 'blocker', { value: blocker }); d.blockerWorld = new Vector3().setFromMatrixPosition(blocker.matrixWorld).toArray().map((n) => +n.toFixed(2)); d.subjectWorld = new Vector3().setFromMatrixPosition(subject.matrixWorld).toArray().map((n) => +n.toFixed(2)); d.cam = cam.position.toArray().map((n) => +n.toFixed(2)); out.push(d) }
  }
  return out
}

function ownerName(o) { for (let n = o; n; n = n.parent) if (n.userData && n.userData.spec) return n.userData.spec; return o ? (o.isSprite ? 'label' : o.name || o.type) : '?' }
