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
//  stability         — contact is not support: an object whose BASE IS NOT FLAT (a conical
//                      tube touching at its tip) cannot stand on its own. Resting and not
//                      held, it must be seated in a socket (a rack, a block, a float, a
//                      rotor). Flat = the resting face (the solid vertices within EPS of
//                      the lowest point) is at least FLAT_BASE × the object's height wide
//                      in its narrower direction (the tangent of the lean that tips it).
//
// Plus pivotAudit: a freshly built model's origin is the centre of its base.
import { Raycaster, Vector3, Matrix4, Box3, DoubleSide, BufferAttribute, BufferGeometry } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { solidMeshes, solidBox } from './solids.js'
import { dims, clearance } from './dims.js'

export const EPS = clearance('contact_epsilon') // ½ mm in world units
export const SCALE_TOLERANCE = 1.3               // a pair may be off its real ratio by ≤ 30 %
export const FLAT_BASE = 0.2                     // tips over past ~11° of lean

const categoryOf = (o) => (o.spec ? dims(o.spec).category : 'unknown')
function hasSpec(n) { let f = false; n.traverse((c) => { if (c.userData && c.userData.spec) f = true }); return f }

// ── object inventory ────────────────────────────────────────────────────────────────
// The objects of a station at one pose: every station prop (children of st.group that
// hold solids) plus the visible travelling vessels / prep tubes handed in by the caller.
export function inventory(st, extra = []) {
  const objs = []
  const add = (node, role) => {
    if (!node || node.isLight || node.isSprite) return
    if (!solidMeshes(node).length) return
    // a spec-less assembly of real objects (a gel rig = tank + power supply): its parts
    if (!node.userData?.spec && node.children.some((c) => hasSpec(c))) { for (const c of node.children) add(c, role); return }
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

// the object's RESTING FACE: its lowest y and up to ~24 (x,z) sample points of the solid
// vertices within EPS of it (a slide bridging two rails touches at its ends, not its centre)
function restingFace(node) {
  node.updateWorldMatrix(true, true)
  let minY = Infinity
  const pts = []
  for (const m of solidMeshes(node)) {
    if (m.isInstancedMesh) continue
    const pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      if (_v.y < minY - EPS) { minY = _v.y; pts.length = 0 }
      if (_v.y <= minY + EPS) pts.push([_v.x, _v.z])
    }
  }
  const step = Math.max(1, Math.floor(pts.length / 24))
  const sample = pts.filter((_, k) => k % step === 0)
  // plus the centroid
  let x = 0, z = 0
  for (const p of pts) { x += p[0]; z += p[1] }
  if (pts.length) sample.push([x / pts.length, z / pts.length])
  return { y: minY, pts: sample }
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
  const lowOf = new Map(objects.map((q) => [q, solidBox(q.node).min.y]))
  const owner = (mesh) => objects.find((q) => { let f = false; q.node.traverse((n) => { if (n === mesh) f = true }); return f })
  for (const o of objects) {
    // tools and anything the choreography says is IN HAND are not resting on anything
    if (o.category === 'tool' || o.node.userData.held || !resting(o)) continue
    // SEATED IN A SOCKET: the socket is the support — the vessel's base centre (its origin)
    // must be ON the socket point (a vertical ray cannot judge a 45° rotor slot)
    const pl = o.node.userData.placement
    if (pl && pl.host && pl.host !== 'bench' && pl.host.userData?.sockets?.[pl.socket]) {
      const a = pl.host.userData.sockets[pl.socket]
      a.updateWorldMatrix(true, false); o.node.updateWorldMatrix(true, false)
      const d = new Vector3().setFromMatrixPosition(a.matrixWorld).distanceTo(new Vector3().setFromMatrixPosition(o.node.matrixWorld))
      if (d > EPS) out.push({ check: 'contact', kind: 'off-socket', object: o.name, on: pl.socket, gap: +d.toFixed(4) })
      continue
    }
    const face = restingFace(o.node)
    if (!isFinite(face.y)) continue
    const top = solidBox(o.node).max.y
    const others = objects.filter((q) => q !== o).flatMap((q) => solidMeshes(q.node).filter((m) => !m.isInstancedMesh))
    let bestGap = Infinity, on = 'bench', sunk = null
    for (const [x, z] of face.pts) {
      const hits = castDown(x, z, top + 0.01, others)
      // a surface passing through o only counts if its owner reaches LOWER than o — the thing
      // o sits in or on. (A tube resting in a block is not "the block sunk into the tube".)
      const through = hits.find((h) => h.point.y > face.y + EPS && h.point.y < top - EPS && (lowOf.get(owner(h.object)) ?? Infinity) < face.y - EPS)
      if (through && !sunk) sunk = { into: owner(through.object)?.name || '?', depth: through.point.y - face.y }
      const below = hits.find((h) => h.point.y <= face.y + EPS)
      const support = below ? below.point.y : 0 // nothing under it → the bench
      const gap = face.y - support
      if (gap < bestGap) { bestGap = gap; on = below ? (owner(below.object)?.name || '?') : 'bench' }
    }
    if (face.y < -EPS) out.push({ check: 'contact', kind: 'below-bench', object: o.name, gap: +face.y.toFixed(4) })
    else if (sunk) out.push({ check: 'contact', kind: 'sunk', object: o.name, into: sunk.into, depth: +sunk.depth.toFixed(4) })
    else if (bestGap > EPS) out.push({ check: 'contact', kind: 'floating', object: o.name, on, gap: +bestGap.toFixed(4) })
  }
  return out
}

// ── stability ───────────────────────────────────────────────────────────────────────
// TIP-OVER MARGIN: the resting face's narrower span over the object's height. An upright
// body tips once tan(lean) exceeds half its support width over its centre-of-mass height
// (~ half its height) — so this ratio is that tangent: ~0.5 for a flat-bottomed bottle,
// ~0.05 for a conical tube standing on its tip, large for a plate or a slide.
export function baseSpan(node) {
  node.updateWorldMatrix(true, true)
  let minY = Infinity
  const pts = []
  for (const m of solidMeshes(node)) {
    if (m.isInstancedMesh) continue
    const pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      if (_v.y < minY - EPS) { minY = _v.y; pts.length = 0 }
      if (_v.y <= minY + EPS) pts.push([_v.x, _v.z])
    }
  }
  if (!pts.length) return Infinity
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const b = solidBox(node), h = b.max.y - b.min.y
  return h > 0 ? Math.min(x1 - x0, z1 - z0) / h : Infinity
}
export function stabilityDefects(objects, resting = () => true) {
  const out = []
  for (const o of objects) {
    if (o.category === 'tool' || o.node.userData.held || !resting(o)) continue
    const pl = o.node.userData.placement
    if (pl && pl.host && pl.host !== 'bench' && pl.host.userData?.sockets?.[pl.socket]) continue   // seated
    const span = baseSpan(o.node)
    if (span < FLAT_BASE) out.push({ check: 'stability', kind: 'unsupported', object: o.name, on: pl?.host === 'bench' ? 'bench' : 'unseated', span: +span.toFixed(3) })
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
  if (!b) { b = new MeshBVH(clean(geometry), { indirect: true }); bvhCache.set(geometry, b) }
  return b
}
// The triangle test is run on a CLEAN copy of each geometry: indexed (three-mesh-bvh wants
// an indexed "other" geometry; Extrude/Shape are not) and with ZERO-AREA triangles removed.
// A lathe's profile points on the axis make degenerate triangles, and three-mesh-bvh reports
// those as intersecting whatever is near (asymmetrically: A∩B true, B∩A false) — a false
// positive, not geometry.
const cleanCache = new WeakMap()
const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _ab = new Vector3(), _ac = new Vector3()
function clean(g) {
  let c = cleanCache.get(g)
  if (c) return c
  const pos = g.attributes.position
  const n = g.index ? g.index.count : pos.count
  const at = (k) => (g.index ? g.index.getX(k) : k)
  const keep = []
  for (let k = 0; k + 2 < n; k += 3) {
    const i0 = at(k), i1 = at(k + 1), i2 = at(k + 2)
    _a.fromBufferAttribute(pos, i0); _b.fromBufferAttribute(pos, i1); _c.fromBufferAttribute(pos, i2)
    const area2 = _ab.subVectors(_b, _a).cross(_ac.subVectors(_c, _a)).lengthSq()
    if (area2 > 1e-18) keep.push(i0, i1, i2)
  }
  c = new BufferGeometry()
  c.setAttribute('position', pos)
  c.setIndex(new BufferAttribute(new (pos.count > 65535 ? Uint32Array : Uint16Array)(keep), 1))
  cleanCache.set(g, c)
  return c
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
      if (bvhOf(mb.geometry).intersectsGeometry(clean(ma.geometry), _mB)) return { a: ma, b: mb }
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
      // a vessel IN HAND passing into an instrument (through a freezer's opening, down onto a
      // tank platform) is not seated yet; one AT REST inside it must be in a socket
      if ((!pl || pl.host !== h.node) && !v.node.userData.held) out.push({ check: 'containment', kind: 'no-socket', object: v.name, host: h.name })
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
  // a TOOL held by its working tip (a pipette) is built with the tip at the origin — its
  // hook makes it asymmetric, so its footprint is not centred on it; the base still is y=0
  if (node.userData.pivotAt === 'tip') {
    if (Math.abs(b.min.y) > tol(sz.y)) issues.push(`tip at y=${b.min.y.toFixed(3)}`)
    return issues.length ? issues : null
  }
  if (Math.abs(b.min.y) > tol(sz.y)) issues.push(`base at y=${b.min.y.toFixed(3)} (height ${sz.y.toFixed(3)})`)
  if (Math.abs(c.x) > tol(sz.x)) issues.push(`footprint centre x=${c.x.toFixed(3)} (width ${sz.x.toFixed(3)})`)
  if (Math.abs(c.z) > tol(sz.z)) issues.push(`footprint centre z=${c.z.toFixed(3)} (depth ${sz.z.toFixed(3)})`)
  return issues.length ? issues : null
}
