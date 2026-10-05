// collisionAudit.js — do solids pass through each other, float, or sink? Pure three.js
// (+ three-mesh-bvh); no DOM, no renderer, so the same code runs on the live runner scene
// (scripts/collision-audit.mjs, through src/dev/collisionDriver.js) and under Vitest.
//
// Input: the objects on a station, each { name, root, held }, where `root` is an Object3D
// whose visible solid meshes ARE the object. Three checks:
//   a) INTERSECT — two objects' surfaces cross (a BVH triangle test), and the penetration
//      is deeper than TOL.depth. Depth = the smaller of the two one-way penetrations (how far
//      A's vertices lie behind B's surface, and B's behind A's): a pipette tip legitimately
//      inside a hollow tube is "behind" the tube's outer wall by the tube's radius, but the
//      tube's wall is not behind the tip — so only a real crossing scores.
//   b) FLOAT / SINK — an object at REST (not moving, not held) touches nothing (no other
//      solid and not the bench) → floating, by its gap; its base is below the bench top →
//      sunk, by the depth.
//   c) SWEEP — a MOVING object's vertices are swept from where they were to where they are;
//      a segment that crosses another object's surface is a pass-through.
// Moving PARTS of one object (a lid on its hinge, a rotor in its bowl) are checked against
// the rest of the same object too: `parts(root)` splits an object into rigid parts.
import { Box3, Vector3, Matrix4, Ray, Triangle, Quaternion } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

export const TOL = {
  // world units. Scale yardstick: the 1.5 mL tube (≈ 40 mm) is ≈ 0.93 units tall here, so
  // 0.01 ≈ 0.4 mm — below what a viewer can see at any of the runner's framings
  depth: 0.01,     // penetration that counts
  contact: 0.01,   // a gap at or below this is contact
  move: 1e-4,      // a vertex displacement above this is motion
}

const _bvh = new WeakMap()
export function bvhOf(geometry) {
  let b = _bvh.get(geometry)
  if (!b) { b = new MeshBVH(geometry, { maxLeafTris: 8 }); _bvh.set(geometry, b) }
  return b
}

const visibleIn = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }
// what a mesh IS (userData.auditKind on the mesh, an ancestor or its material — set by the
// builders, metadata only): 'fluid', 'granular' (ice), 'effect' (steam, mist, frost), or solid
export function kindOf(m) {
  for (let n = m; n; n = n.parent) if (n.userData && n.userData.auditKind) return n.userData.auditKind
  for (const x of [].concat(m.material || [])) if (x && x.userData && x.userData.auditKind) return x.userData.auditKind
  if ([].concat(m.material || []).some((x) => x && x.blending === 2)) return 'effect'   // AdditiveBlending: a glow
  if (m.isInstancedMesh) return 'granular'                                              // instanced fills
  return 'solid'
}
// a SOLID mesh: a triangulated mesh, not a sprite, of kind solid (or fluid, when asked — a
// liquid must stay inside its own vessel, but anything may dip into it)
export function isSolid(m, { fluids = false } = {}) {
  if (!m.isMesh || m.isSprite || !m.geometry || !m.geometry.attributes.position) return false
  const k = kindOf(m)
  return k === 'solid' || (fluids && k === 'fluid')
}
// stopAt: other objects' roots — a vessel docked INTO an instrument (a tube in a rotor slot)
// is its own object, not part of the instrument
export function solidMeshes(root, stopAt = null, opts = {}) {
  const out = []
  root.updateWorldMatrix(true, true)
  const walk = (o) => {
    if (o !== root && stopAt && stopAt.has(o)) return
    if (isSolid(o, opts) && visibleIn(o)) out.push(o)
    for (const c of o.children) walk(c)
  }
  walk(root)
  return out
}
function worldBox(meshes) {
  const b = new Box3(), t = new Box3()
  for (const m of meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.union(t.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld)) }
  return b
}

// ── a · penetration between two meshes ───────────────────────────────────────────────────
const _m = new Matrix4(), _inv = new Matrix4(), _v = new Vector3(), _hit = {}, _tri = new Triangle(), _n = new Vector3()
// SAMPLE POINTS of a geometry (local): its vertices, triangle centroids and edge midpoints —
// two boxes overlapping face-on have no vertex inside each other, but their faces' centroids are
const _samples = new WeakMap()
function samplesOf(g, cap = 900) {
  let out = _samples.get(g)
  if (out) return out
  const pos = g.attributes.position, idx = g.index, nTri = idx ? idx.count / 3 : pos.count / 3
  const pts = []
  for (let i = 0; i < pos.count; i++) pts.push(new Vector3().fromBufferAttribute(pos, i))
  const a = new Vector3(), b = new Vector3(), c = new Vector3()
  for (let t = 0; t < nTri; t++) {
    const i0 = idx ? idx.getX(3 * t) : 3 * t, i1 = idx ? idx.getX(3 * t + 1) : 3 * t + 1, i2 = idx ? idx.getX(3 * t + 2) : 3 * t + 2
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2)
    pts.push(a.clone().add(b).add(c).divideScalar(3), a.clone().add(b).multiplyScalar(0.5), b.clone().add(c).multiplyScalar(0.5), c.clone().add(a).multiplyScalar(0.5))
  }
  const step = Math.max(1, Math.floor(pts.length / cap))
  out = step === 1 ? pts : pts.filter((_, k) => k % step === 0)
  _samples.set(g, out)
  return out
}
// CLOSED (watertight) geometry: every edge, after welding coincident vertices, is shared by
// exactly two triangles. Only a closed solid has an inside to be contained in.
const _closed = new WeakMap()
export function isClosed(g) {
  if (_closed.has(g)) return _closed.get(g)
  const pos = g.attributes.position, idx = g.index, nTri = idx ? idx.count / 3 : pos.count / 3
  const key = (i) => `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`
  const id = new Map(), vid = (i) => { const k = key(i); let v = id.get(k); if (v == null) { v = id.size; id.set(k, v) } return v }
  const edges = new Map()
  for (let t = 0; t < nTri; t++) {
    const v = [0, 1, 2].map((k) => vid(idx ? idx.getX(3 * t + k) : 3 * t + k))
    if (v[0] === v[1] || v[1] === v[2] || v[2] === v[0]) continue   // degenerate (a lathe's pole)
    for (const [p, q] of [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]]) { const k = p < q ? `${p}_${q}` : `${q}_${p}`; edges.set(k, (edges.get(k) || 0) + 1) }
  }
  let ok = edges.size > 0
  for (const n of edges.values()) if (n !== 2) { ok = false; break }
  _closed.set(g, ok)
  return ok
}
const scaleOf = (m) => { const s = new Vector3(); m.matrixWorld.decompose(new Vector3(), new Quaternion(), s); return Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) || 1 }
// is a point (B local) inside closed mesh B — ray parity (independent of face winding: the
// scene's glass is double-sided, its lathes wound either way)
const _r = new Ray()
function insideLocal(bvh, pLocal) {
  _r.origin.copy(pLocal); _r.direction.set(0.5773, 0.5774, 0.5775).normalize()
  return bvh.raycast(_r, 2).length % 2 === 1
}
// how deep A's sample points lie INSIDE closed B: the largest distance from such a point to
// B's surface (0 when none is inside)
function depthInside(a, b, region) {
  const bvh = bvhOf(b.geometry)
  _inv.copy(b.matrixWorld).invert()
  _m.multiplyMatrices(_inv, a.matrixWorld)                       // A local → B local
  const scale = scaleOf(b)
  const lb = b.geometry.boundingBox
  let worst = 0
  const w = new Vector3()
  for (const p of samplesOf(a.geometry)) {
    w.copy(p).applyMatrix4(a.matrixWorld)
    if (region && !region.containsPoint(w)) continue
    _v.copy(p).applyMatrix4(_m)
    if (!lb.containsPoint(_v) || !insideLocal(bvh, _v)) continue
    if (bvh.closestPointToPoint(_v, _hit)) worst = Math.max(worst, _hit.distance * scale)
  }
  return worst
}
// a crossing's depth (world units), or 0: how deep either mesh's material lies inside the
// other (a closed solid has an inside; an open shell — a single-surface wall — has none).
// Covers surfaces that cross (a tube through a rack) and one solid wholly inside another (a
// lid sunk into a body). Coplanar faces that merely touch score 0. Two OPEN shells that cross
// have no inside to measure: their depth is the smallest extent of their boxes' overlap.
export function penetration(a, b) {
  if (!a.geometry.boundingBox) a.geometry.computeBoundingBox()
  if (!b.geometry.boundingBox) b.geometry.computeBoundingBox()
  const ba = a.geometry.boundingBox.clone().applyMatrix4(a.matrixWorld), bb = b.geometry.boundingBox.clone().applyMatrix4(b.matrixWorld)
  if (!ba.intersectsBox(bb)) return 0
  const region = ba.clone().intersect(bb).expandByScalar(1e-6)
  const ca = isClosed(a.geometry), cb = isClosed(b.geometry)
  if (ca || cb) return Math.max(cb ? depthInside(a, b, region) : 0, ca ? depthInside(b, a, region) : 0)
  _m.copy(a.matrixWorld).invert().multiply(b.matrixWorld)        // B local → A local
  if (!bvhOf(a.geometry).intersectsGeometry(b.geometry, _m)) return 0
  // the smaller shell pokes through the larger: how far its MINORITY side lies past it
  const big = ba.getSize(new Vector3()).length() >= bb.getSize(new Vector3()).length()
  return big ? minoritySide(b, a) : minoritySide(a, b)
}
// A's samples split by the side of B's surface they lie on (B's face normals; one mesh is
// wound one way throughout); the side holding fewer of them is the part that went through,
// and its depth is the farthest such sample from B's surface
function minoritySide(a, b) {
  const bvh = bvhOf(b.geometry)
  _inv.copy(b.matrixWorld).invert()
  _m.multiplyMatrices(_inv, a.matrixWorld)
  const scale = scaleOf(b)
  const idx = b.geometry.index, bpos = b.geometry.attributes.position
  let nPos = 0, nNeg = 0, dPos = 0, dNeg = 0
  for (const p of samplesOf(a.geometry)) {
    _v.copy(p).applyMatrix4(_m)
    if (!bvh.closestPointToPoint(_v, _hit)) continue
    const f = _hit.faceIndex
    const i0 = idx ? idx.getX(f * 3) : f * 3, i1 = idx ? idx.getX(f * 3 + 1) : f * 3 + 1, i2 = idx ? idx.getX(f * 3 + 2) : f * 3 + 2
    _tri.a.fromBufferAttribute(bpos, i0); _tri.b.fromBufferAttribute(bpos, i1); _tri.c.fromBufferAttribute(bpos, i2)
    _tri.getNormal(_n)
    const side = _v.clone().sub(_hit.point).dot(_n), d = _hit.distance * scale
    if (side > 0) { nPos++; dPos = Math.max(dPos, d) } else if (side < 0) { nNeg++; dNeg = Math.max(dNeg, d) }
  }
  return nPos <= nNeg ? dPos : dNeg
}
// the deepest crossing between two sets of meshes
export function setPenetration(as, bs) {
  let worst = 0, at = null
  const bb = worldBox(bs)
  for (const a of as) {
    if (!a.geometry.boundingBox) a.geometry.computeBoundingBox()
    if (!a.geometry.boundingBox.clone().applyMatrix4(a.matrixWorld).intersectsBox(bb)) continue
    for (const b of bs) { const d = penetration(a, b); if (d > worst) { worst = d; at = [a, b] } }
  }
  return { depth: worst, at }
}

// ── b · the gap from a set of meshes to another (0 when touching or crossing) ────────────
// Mesh pairs are tried nearest-box first, and the search stops at contact: "does it touch
// anything" is the question, so the first touching pair answers it.
function boxGap(a, b) {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x), dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y), dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z)
  return Math.hypot(dx, dy, dz)
}
export function gap(as, bs, maxD = 0.05, stopAt = TOL.contact) {
  let best = Infinity
  const t1 = {}, t2 = {}
  const box = (m) => { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); return m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld) }
  const A = as.map((m) => [m, box(m)]), B = bs.map((m) => [m, box(m)])
  const pairs = []
  for (const [a, ab] of A) for (const [b, bb] of B) { const g = boxGap(ab, bb); if (g <= maxD) pairs.push([g, a, b]) }
  pairs.sort((x, y) => x[0] - y[0])
  for (const [g, a, b] of pairs) {
    if (g >= best) break
    const sc = scaleOf(a)
    _m.copy(a.matrixWorld).invert().multiply(b.matrixWorld)
    const r = bvhOf(a.geometry).closestPointToGeometry(b.geometry, _m, t1, t2, 0, Math.min(maxD, best) / sc)
    if (r && r.distance * sc < best) best = r.distance * sc
    if (best <= stopAt) return best
  }
  return best
}

// ── rigid PARTS of one object: meshes grouped by their transform relative to the root ──
// (meshes that move together between two frames form one part)
export function snapshot(meshes, root) {
  root.updateWorldMatrix(true, true)
  const inv = new Matrix4().copy(root.matrixWorld).invert()
  return new Map(meshes.map((m) => [m, new Matrix4().multiplyMatrices(inv, m.matrixWorld)]))
}
const moved = (a, b, eps) => { for (let i = 0; i < 16; i++) if (Math.abs(a.elements[i] - b.elements[i]) > eps) return true; return false }

// ── c · sweep: does any vertex of `meshes` cross another surface from `prev` to now ──────
const _ray = new Ray()
export function sweep(meshes, prevWorld, others, cap = 64) {
  let worst = null
  for (const m of meshes) {
    const pm = prevWorld.get(m); if (!pm) continue
    const pos = m.geometry.attributes.position
    const step = Math.max(1, Math.floor(pos.count / cap))
    for (let i = 0; i < pos.count; i += step) {
      const p0 = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(pm)
      const p1 = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      const len = p0.distanceTo(p1)
      if (len < TOL.move) continue
      for (const o of others) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
        const ob = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)
        if (!ob.intersectsBox(new Box3().setFromPoints([p0, p1]))) continue
        _inv.copy(o.matrixWorld).invert()
        const a = p0.clone().applyMatrix4(_inv), b = p1.clone().applyMatrix4(_inv)
        const dir = b.clone().sub(a), L = dir.length(); dir.normalize()
        _ray.set(a, dir)
        const hit = bvhOf(o.geometry).raycastFirst(_ray, 2 /* DoubleSide */)
        if (hit && hit.distance <= L) { if (!worst || len > worst.len) worst = { mesh: m, other: o, len, at: p1 } }
      }
    }
  }
  return worst
}

// ── one pose of a station ────────────────────────────────────────────────────────────────
// objects: [{ name, root, held }]; prev: the previous pose's state (or null);
// returns { defects, state }. benchY: the bench top. Moving = any solid's world matrix
// changed since prev; a moving object is exempt from float (it is carried). A pair whose
// objects have not moved since prev keeps prev's result (most of a step is at rest).
// A moving PART of an object (a lid, a cap) is red only when it is deeper in the rest of its
// object than at its own first-seen pose: a cap seated on its neck overlaps by design.
const proxy = (m, world) => ({ geometry: m.geometry, matrixWorld: world })
// a mesh, named well enough to find it in its builder: geometry type, size, colour, where
const r3 = (v) => v.toArray().map((x) => +x.toFixed(3))
export function describe(m) {
  if (!m) return null
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
  const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)
  const mat = [].concat(m.material || [])[0]
  return { geo: m.geometry.type, color: mat && mat.color ? '#' + mat.color.getHexString() : null, opacity: mat ? mat.opacity : null, min: r3(b.min), max: r3(b.max), name: m.name || undefined }
}
// frame: the frame number of this pose; an object FLOATS only after REST_FRAMES unmoved (the top
// of a carry arc stops for an instant — that is a motion, not a rest)
export const REST_FRAMES = 30
export function auditPose(objects, { benchY = 0, prev = null, checkSweep = true, frame = 0 } = {}) {
  const defects = []
  const roots = new Set(objects.map((o) => o.root))
  const items = objects.map((o) => ({ ...o, meshes: solidMeshes(o.root, roots) })).filter((o) => o.meshes.length)
  const world = new Map()
  for (const it of items) for (const m of it.meshes) world.set(m, m.matrixWorld.clone())
  for (const it of items) {
    it.moving = !!prev && it.meshes.some((m) => { const w = prev.world.get(m); return w && moved(w, m.matrixWorld, TOL.move) })
    it.changed = !prev || it.moving || it.meshes.some((m) => !prev.world.has(m)) || (prev.count.get(it.root) !== it.meshes.length)
    it.box = worldBox(it.meshes)
  }
  const pairs = new Map()
  // a · object × object
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j]
    const key = A.root.uuid < B.root.uuid ? `${A.root.uuid}|${B.root.uuid}` : `${B.root.uuid}|${A.root.uuid}`
    let r
    if (!A.changed && !B.changed && prev && prev.pairs.has(key)) r = prev.pairs.get(key)
    else r = A.box.intersectsBox(B.box) ? setPenetration(A.meshes, B.meshes) : { depth: 0, at: null }
    pairs.set(key, r)
    if (r.depth > TOL.depth) defects.push({ check: 'intersect', a: A.name, b: B.name, depth: r.depth, meshes: r.at && r.at.map(describe) })
  }
  // a' · a moving part of one object × the rest of it (lid × body), against its first pose
  const first = new Map(prev ? prev.first : [])
  for (const it of items) {
    it.withFluids = solidMeshes(it.root, roots, { fluids: true })
    const now = snapshot(it.withFluids, it.root)
    const f = first.get(it.root) || new Map()
    for (const [m, local] of now) if (!f.has(m)) f.set(m, local)
    first.set(it.root, f)
    if (!prev) continue
    const was = prev.parts.get(it.root)
    if (!was) continue
    const all = it.withFluids
    const movingParts = all.filter((m) => was.get(m) && moved(was.get(m), now.get(m), TOL.move))
    if (!movingParts.length || movingParts.length === all.length) continue
    const rest = all.filter((m) => !movingParts.includes(m) && kindOf(m) === 'solid')   // a fluid moves through no other fluid
    const { depth, at } = setPenetration(movingParts, rest)
    if (depth <= TOL.depth) continue
    const atFirst = movingParts.map((m) => proxy(m, new Matrix4().multiplyMatrices(it.root.matrixWorld, f.get(m))))
    const { depth: d0 } = setPenetration(atFirst, rest)
    if (depth > d0 + TOL.depth) defects.push({ check: 'intersect', a: `${it.name} (moving part)`, b: `${it.name} (body)`, depth: depth - d0, meshes: at && at.map(describe) })
  }
  // b · float / sink (objects at rest, not held)
  const gaps = new Map(), restSince = new Map()
  for (const it of items) {
    const was = prev && prev.restSince ? prev.restSince.get(it.root) : undefined
    restSince.set(it.root, it.moving ? frame : (was != null ? was : -Infinity))
  }
  for (const it of items) {
    const box = it.box
    if (box.min.y < benchY - TOL.depth) defects.push({ check: 'sunk', a: it.name, b: 'bench', depth: benchY - box.min.y })
    if (it.held || it.moving || frame - restSince.get(it.root) < REST_FRAMES) continue
    if (box.min.y <= benchY + TOL.contact) continue                      // on the bench
    // nothing moved since prev: the answer is prev's
    let g
    if (prev && prev.gaps && prev.gaps.has(it.root) && !items.some((o) => o.changed)) g = prev.gaps.get(it.root)
    else { const others = items.filter((o) => o !== it).flatMap((o) => o.meshes); g = others.length ? gap(it.meshes, others, 0.5) : Infinity }
    gaps.set(it.root, g)
    if (g > TOL.contact) defects.push({ check: 'float', a: it.name, b: g === Infinity ? 'nothing within 0.5' : 'nearest solid', depth: g === Infinity ? box.min.y - benchY : g, box: { min: r3(box.min), max: r3(box.max) } })
  }
  // c · sweep (moving objects, against every other object)
  if (prev && checkSweep) for (const it of items) {
    if (!it.moving) continue
    const others = items.filter((o) => o !== it).flatMap((o) => o.meshes)
    const s = sweep(it.meshes, prev.world, others)
    if (s) {
      const owner = items.find((o) => o.meshes.includes(s.other))
      defects.push({ check: 'sweep', a: it.name, b: owner ? owner.name : '?', depth: s.len, meshes: [describe(s.mesh), describe(s.other)], at: r3(s.at) })
    }
  }
  const parts = new Map(items.map((it) => [it.root, snapshot(it.withFluids, it.root)]))
  const count = new Map(items.map((it) => [it.root, it.meshes.length]))
  return { defects, state: { world, parts, pairs, first, count, gaps, restSince } }
}
