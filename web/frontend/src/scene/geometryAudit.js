// geometryAudit.js — the scene's geometry as TESTS, not judgement. Pure three.js (+ the
// three-mesh-bvh triangle tests); no DOM, no renderer. Four checks, each over the objects
// present in one station at one pose:
//
//  contact           — a RESTING object's lowest solid point sits on the surface directly
//                      beneath it (another object's solid, or the bench y=0) within EPS:
//                      no floating; and no other object's surface passes through it at
//                      that point (no sinking into a lid, plate or block).
//  containment       — a vessel inside an instrument's envelope is IN its cavity: its solids
//                      do not cut the instrument's solids (through a wall), and it got there
//                      through a declared socket (userData.placement) that accepts it.
//  interpenetration  — no two objects' solids intersect (exact triangle test), allowing
//                      EPS of contact. Vessel/instrument pairs are containment's job.
//  relativeScale     — every pair of objects in the frame is sized in the ratio of its
//                      real-world counterparts (dimensions.json) within SCALE_TOLERANCE.
//
// Plus pivotAudit: a freshly built model's origin is the centre of its base.
import { Raycaster, Vector3, Matrix4, Box3, DoubleSide } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { solidMeshes, solidBox } from './solids.js'
import { dims, clearance } from './dims.js'

export const EPS = clearance('contact_epsilon') // ½ mm in world units
export const SCALE_TOLERANCE = 1.3               // a pair may be off its real ratio by ≤ 30 %

const categoryOf = (o) => (o.spec ? dims(o.spec).category : 'unknown')

// ── object inventory ────────────────────────────────────────────────────────────────
// The objects of a station at one pose: every station prop (children of st.group that
// hold solids) plus the visible travelling vessels / prep tubes handed in by the caller.
export function inventory(st, extra = []) {
  const objs = []
  const add = (node, role) => {
    if (!node || node.isLight || node.isSprite) return
    if (!solidMeshes(node).length) return
    const spec = node.userData?.spec || null
    objs.push({ node, spec, role, name: spec || node.name || node.type, category: spec ? dims(spec).category : 'unknown' })
  }
  for (const c of st.group.children) add(c, 'prop')
  for (const v of extra) add(v, 'sample')
  return objs
}

// ── contact ─────────────────────────────────────────────────────────────────────────
const _ray = new Raycaster()
const _v = new Vector3()
const DOWN = new Vector3(0, -1, 0)

function lowestFootprint(node) {
  // centroid (x,z) of the solid vertices within EPS of the lowest point, and that lowest y
  node.updateWorldMatrix(true, true)
  let minY = Infinity
  const pts = []
  for (const m of solidMeshes(node)) {
    if (m.isInstancedMesh) continue
    const pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      if (_v.y < minY - EPS) { minY = _v.y; pts.length = 0 }
      if (_v.y <= minY + EPS) pts.push(_v.x, _v.z)
    }
  }
  let x = 0, z = 0
  for (let i = 0; i < pts.length; i += 2) { x += pts[i]; z += pts[i + 1] }
  const n = pts.length / 2 || 1
  return { x: x / n, z: z / n, y: minY }
}

function castDown(x, z, fromY, meshes) {
  _ray.set(new Vector3(x, fromY, z), DOWN)
  _ray.far = Infinity
  const saved = meshes.map((m) => { const arr = Array.isArray(m.material) ? m.material : [m.material]; const s = arr.map((a) => a && a.side); arr.forEach((a) => { if (a) a.side = DoubleSide }); return [arr, s] })
  const hits = _ray.intersectObjects(meshes, false)
  saved.forEach(([arr, s]) => arr.forEach((a, i) => { if (a) a.side = s[i] }))
  return hits
}

// objects: inventory(); resting(o) → true when o is at rest (not carried) at this pose
export function contactDefects(objects, resting = () => true) {
  const out = []
  for (const o of objects) {
    // tools and anything the choreography says is IN HAND are not resting on anything
    if (o.category === 'tool' || o.node.userData.held || !resting(o)) continue
    const low = lowestFootprint(o.node)
    if (!isFinite(low.y)) continue
    const top = solidBox(o.node).max.y
    const others = objects.filter((q) => q !== o).flatMap((q) => solidMeshes(q.node).filter((m) => !m.isInstancedMesh))
    const hits = castDown(low.x, low.z, top + 0.01, others)
    // a surface passing through o only counts if its owner reaches LOWER than o — the thing
    // o sits in or on. (A tube resting in a block is not "the block sunk into the tube".)
    const lowOf = new Map(objects.map((q) => [q, solidBox(q.node).min.y]))
    const ownerLow = (mesh) => { const q = objects.find((q) => { let f = false; q.node.traverse((n) => { if (n === mesh) f = true }); return f }); return q ? lowOf.get(q) : Infinity }
    const through = hits.filter((h) => h.point.y > low.y + EPS && h.point.y < top - EPS && ownerLow(h.object) < low.y - EPS)
    const below = hits.filter((h) => h.point.y <= low.y + EPS)
    const support = below.length ? below[0].point.y : 0 // nothing under it → the bench
    const gap = low.y - support
    if (low.y < -EPS) out.push({ check: 'contact', kind: 'below-bench', object: o.name, gap: +low.y.toFixed(4) })
    else if (through.length) out.push({ check: 'contact', kind: 'sunk', object: o.name, into: ownerName(through[0].object, objects), depth: +(through[0].point.y - low.y).toFixed(4) })
    else if (gap > EPS) out.push({ check: 'contact', kind: 'floating', object: o.name, on: below.length ? ownerName(below[0].object, objects) : 'bench', gap: +gap.toFixed(4) })
  }
  return out
}

function ownerName(mesh, objects) {
  for (const o of objects) { let hit = false; o.node.traverse((n) => { if (n === mesh) hit = true }); if (hit) return o.name }
  return '?'
}

// ── exact solid-vs-solid intersection ──────────────────────────────────────────────
const bvhCache = new WeakMap()
function bvhOf(geometry) {
  let b = bvhCache.get(geometry)
  if (!b) { b = new MeshBVH(geometry, { indirect: true }); bvhCache.set(geometry, b) }
  return b
}
const _mA = new Matrix4(), _mB = new Matrix4(), _shr = new Matrix4(), _t = new Matrix4()
const _bA = new Box3(), _bB = new Box3()

// Do object A's solids cut object B's solids? A is shrunk by EPS toward its own centre
// first, so surfaces that merely TOUCH (a tube standing on a floor) are not intersections.
export function objectsIntersect(A, B) {
  const box = solidBox(A.node)
  if (box.isEmpty()) return null
  const c = box.getCenter(new Vector3()), sz = box.getSize(new Vector3())
  const s = (d) => Math.max(0, 1 - (2 * EPS) / Math.max(d, 1e-9))
  _shr.makeTranslation(c.x, c.y, c.z).multiply(_t.makeScale(s(sz.x), s(sz.y), s(sz.z))).multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z))
  const bMeshes = solidMeshes(B.node).filter((m) => !m.isInstancedMesh)
  for (const ma of solidMeshes(A.node)) {
    if (ma.isInstancedMesh) continue
    if (!ma.geometry.boundingBox) ma.geometry.computeBoundingBox()
    _mA.copy(_shr).multiply(ma.matrixWorld)
    _bA.copy(ma.geometry.boundingBox).applyMatrix4(_mA)
    for (const mb of bMeshes) {
      if (!mb.geometry.boundingBox) mb.geometry.computeBoundingBox()
      _bB.copy(mb.geometry.boundingBox).applyMatrix4(mb.matrixWorld)
      if (!_bA.intersectsBox(_bB)) continue
      _mB.copy(mb.matrixWorld).invert().multiply(_mA) // A-geometry → B-geometry space
      if (bvhOf(mb.geometry).intersectsGeometry(ma.geometry, _mB)) return { a: ma, b: mb }
    }
  }
  return null
}

const isVessel = (o) => o.category === 'vessel'
const isHost = (o) => o.category === 'instrument'
function envelopeContains(host, v) {
  const hb = solidBox(host.node).expandByScalar(EPS)
  const c = solidBox(v.node).getCenter(new Vector3())
  return hb.containsPoint(c)
}

// ── containment ─────────────────────────────────────────────────────────────────────
export function containmentDefects(objects) {
  const out = []
  for (const v of objects.filter(isVessel)) {
    for (const h of objects.filter(isHost)) {
      if (!envelopeContains(h, v)) continue
      const pl = v.node.userData.placement
      if (!pl || pl.host !== h.node) out.push({ check: 'containment', kind: 'no-socket', object: v.name, host: h.name })
      else if (!dims(h.spec).accepts.includes(v.spec)) out.push({ check: 'containment', kind: 'rejected', object: v.name, host: h.name, socket: pl.socket })
      if (objectsIntersect(v, h)) out.push({ check: 'containment', kind: 'through-wall', object: v.name, host: h.name })
    }
  }
  return out
}

// ── interpenetration ────────────────────────────────────────────────────────────────
export function interpenetrationDefects(objects) {
  const out = []
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const A = objects[i], B = objects[j]
      if ((isVessel(A) && isHost(B) && envelopeContains(B, A)) || (isVessel(B) && isHost(A) && envelopeContains(A, B))) continue
      if (objectsIntersect(A, B) || objectsIntersect(B, A)) out.push({ check: 'interpenetration', a: A.name, b: B.name })
    }
  }
  return out
}

// ── relative scale ──────────────────────────────────────────────────────────────────
// How big the object is drawn relative to its real counterpart: world size ÷ real size,
// averaged (geometric mean) over the axes that are not thin (≥ ¼ of its largest real
// dimension — a slide's 1 mm thickness would otherwise dominate).
const _s = new Vector3()
export function drawnScale(o) {
  const d = dims(o.spec)
  const size = (o.node.userData.canonicalSize ? new Vector3().copy(o.node.userData.canonicalSize) : solidBox(o.node, o.node).getSize(new Vector3()))
  o.node.getWorldScale(_s)
  size.multiply(_s)
  const real = [d.width, d.height, d.depth], drawn = [size.x, size.y, size.z]
  const big = Math.max(...real)
  let lg = 0, n = 0
  for (let a = 0; a < 3; a++) if (real[a] >= 0.25 * big && drawn[a] > 0) { lg += Math.log(drawn[a] / real[a]); n++ }
  return Math.exp(lg / Math.max(n, 1))
}

export function relativeScaleDefects(objects) {
  const out = []
  const sized = objects.filter((o) => o.spec)
  for (let i = 0; i < sized.length; i++) {
    for (let j = i + 1; j < sized.length; j++) {
      const ki = drawnScale(sized[i]), kj = drawnScale(sized[j])
      const r = ki / kj
      if (r > SCALE_TOLERANCE || r < 1 / SCALE_TOLERANCE) out.push({ check: 'relativeScale', a: sized[i].name, b: sized[j].name, ratioOff: +r.toFixed(3) })
    }
  }
  return out
}

// ── pivot convention ────────────────────────────────────────────────────────────────
// A freshly built model's origin must be the centre of its base: its solids' lowest point
// at y=0 and its footprint centred on x=z=0 (tolerance: EPS, or 2 % of the extent).
export function pivotDefect(node) {
  const b = solidBox(node, node)
  const c = b.getCenter(new Vector3()), sz = b.getSize(new Vector3())
  const tol = (ext) => Math.max(EPS, 0.02 * ext)
  const issues = []
  if (Math.abs(b.min.y) > tol(sz.y)) issues.push(`base at y=${b.min.y.toFixed(3)} (height ${sz.y.toFixed(3)})`)
  if (Math.abs(c.x) > tol(sz.x)) issues.push(`footprint centre x=${c.x.toFixed(3)} (width ${sz.x.toFixed(3)})`)
  if (Math.abs(c.z) > tol(sz.z)) issues.push(`footprint centre z=${c.z.toFixed(3)} (depth ${sz.z.toFixed(3)})`)
  return issues.length ? issues : null
}
