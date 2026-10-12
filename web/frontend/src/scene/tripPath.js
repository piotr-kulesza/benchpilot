// tripPath.js — the WAY a vessel takes to the next station (its timing is tripEase.js). Pure — no DOM.
//
// Straight where nothing is in the way. Out of what holds it (a rotor in its shell, an ice bucket, a rack —
// any solid its box touches at the start) it first rises STRAIGHT UP until its foot is TRIP_CLEAR over that
// thing's top, and it goes into its seat the same way, straight down. Where the line between is blocked, it
// is carried OVER what is in the way, TRIP_CLEAR above its top. The corners are rounded (one smooth arc) and
// each vertex stands TRIP_ROUND higher than its clearance, so the rounded curve never dips below it.
// Boxes are world AABBs { min: {x,y,z}, max: {x,y,z} }; `ext` is the vessel's extent about its origin
// ({ below, above, rx, rz }).
export const TRIP_CLEAR = 0.05
export const TRIP_ROUND = 0.15
const STEP = 0.05

const P = (x, y, z) => ({ x, y, z })
const same = (a, b) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9
const grow = (v, d) => ({ min: P(v.min.x - d, v.min.y - d, v.min.z - d), max: P(v.max.x + d, v.max.y + d, v.max.z + d) })
const touches = (b, v, tol) => b.min.x <= v.max.x + tol && b.max.x >= v.min.x - tol && b.min.y <= v.max.y + tol && b.max.y >= v.min.y - tol && b.min.z <= v.max.z + tol && b.max.z >= v.min.z - tol

// the polyline with each inner corner replaced by a quadratic curve through it (radius R), densely sampled
export function roundedPath(pts, R = TRIP_ROUND, n = 10) {
  const q = pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]))
  if (q.length < 3) return q.map((p) => P(p.x, p.y, p.z))
  const out = [P(q[0].x, q[0].y, q[0].z)]
  for (let i = 1; i < q.length - 1; i++) {
    const a = q[i - 1], c = q[i], b = q[i + 1]
    const la = Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z), lb = Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z)
    const ra = Math.min(R, la / 2), rb = Math.min(R, lb / 2)
    const p0 = P(c.x + (a.x - c.x) * ra / la, c.y + (a.y - c.y) * ra / la, c.z + (a.z - c.z) * ra / la)
    const p2 = P(c.x + (b.x - c.x) * rb / lb, c.y + (b.y - c.y) * rb / lb, c.z + (b.z - c.z) * rb / lb)
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t
      out.push(P(p0.x * u * u + 2 * c.x * u * t + p2.x * t * t, p0.y * u * u + 2 * c.y * u * t + p2.y * t * t, p0.z * u * u + 2 * c.z * u * t + p2.z * t * t))
    }
  }
  const e = q[q.length - 1]
  out.push(P(e.x, e.y, e.z))
  return out.filter((p, i) => i === 0 || !same(p, out[i - 1]))
}

// the boxes (their indices) the vessel's box, grown by `clear`, meets anywhere along the polyline;
// ignore(p, i): a box that does not count at that point (what holds it, on its way straight out of it)
export function pathHits(pts, ext, boxes, clear = TRIP_CLEAR, ignore = null) {
  const hit = new Set()
  const at = (p) => {
    const v = { min: P(p.x - ext.rx - clear, p.y - ext.below - clear, p.z - ext.rz - clear), max: P(p.x + ext.rx + clear, p.y + ext.above + clear, p.z + ext.rz + clear) }
    // (a box may refine its test: b.hit(v) — the part's own oriented box, not its world AABB: a door standing
    // open on the diagonal filled an AABB the vessel's way passed through)
    boxes.forEach((b, i) => { if (!hit.has(i) && touches(b, v, -1e-9) && (!b.hit || b.hit(v)) && !(ignore && ignore(p, i))) hit.add(i) })
  }
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) { at(pts[0]); continue }
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(1, Math.ceil(d / STEP))
    for (let k = 1; k <= n; k++) at(P(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, a.z + (b.z - a.z) * k / n))
  }
  return [...hit]
}

// { pts (the vertices; roundedPath(pts) is the way), lift (the foot's height out of what held it, or null),
//   entry (the same over its seat), carry (the foot's height over what was in the way, or null),
//   front (out through the front of what stands over it — a freezer's shelf, an arm — before it rises) }
export function planTrip({ start, seat, ext, boxes, startBox = null, seatBox = null, clear = TRIP_CLEAR, R = TRIP_ROUND }) {
  const foot = (a, b) => a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z
  // what HOLDS it: what its box touches, not what stands over it; what stands OVER it: a solid over its footprint
  const holders = (vb) => (vb ? boxes.map((b, i) => (touches(b, vb, 0.005) && (!b.hit || b.hit(grow(vb, 0.005))) && b.min.y < vb.max.y - 0.02 ? i : -1)).filter((i) => i >= 0) : [])
  const over = (vb, hs) => {
    if (!vb || !hs.length) return []
    return boxes.map((b, i) => (!hs.includes(i) && foot(b, vb) && b.min.y >= vb.max.y - 0.02 ? i : -1)).filter((i) => i >= 0)
  }
  let hs = holders(startBox), he = holders(seatBox)
  const os = over(startBox, hs), oe = over(seatBox, he)
  // out through the FRONT (+z, toward the viewer) first, at its own height, until clear of what holds it and what
  // stands over it; it goes into such a seat the same way, in from the front
  const frontOf = (ids, p) => P(p.x, p.y, Math.max(...ids.map((i) => boxes[i].max.z)) + clear + ext.rz + R)
  const fs = os.length ? frontOf([...hs, ...os], start) : null, fe = oe.length ? frontOf([...he, ...oe], seat) : null
  const shift = (vb, p, q) => (vb ? { min: P(vb.min.x + q.x - p.x, vb.min.y + q.y - p.y, vb.min.z + q.z - p.z), max: P(vb.max.x + q.x - p.x, vb.max.y + q.y - p.y, vb.max.z + q.z - p.z) } : null)
  const s0 = fs || start, e0 = fe || seat
  const hs0 = hs, he0 = he
  if (fs) hs = holders(shift(startBox, start, fs))
  if (fe) he = holders(shift(seatBox, seat, fe))
  const topOf = (ids) => Math.max(...ids.map((i) => boxes[i].max.y))
  const lift = hs.length ? topOf(hs) + clear : null, entry = he.length ? topOf(he) + clear : null
  const above = (p, f) => P(p.x, Math.max(p.y, f + ext.below + R), p.z)
  const onAxis = (p, q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.z - q.z) < 1e-6
  const onFront = (p, q, f) => f && Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6 && p.z >= q.z - 1e-6 && p.z <= f.z + 1e-6
  // what holds it does not count on its way straight up out of it (or down into its seat), nor on its way out
  // of the front of it
  const ignore = (p, i) => (hs.includes(i) && onAxis(p, s0)) || (he.includes(i) && onAxis(p, e0)) ||
    (hs0.includes(i) && onFront(p, start, fs)) || (he0.includes(i) && onFront(p, seat, fe))
  const build = (carry) => {
    const s = [P(start.x, start.y, start.z)]
    if (fs) s.push(fs)
    const f = carry != null ? Math.max(carry, lift ?? -Infinity) : lift
    if (f != null) s.push(above(s0, f))
    const g = carry != null ? Math.max(carry, entry ?? -Infinity) : entry
    if (g != null) s.push(above(e0, g))
    if (fe) s.push(fe)
    s.push(P(seat.x, seat.y, seat.z))
    return s.filter((p, i) => i === 0 || !same(p, s[i - 1]))
  }
  let pts = build(null)
  let hits = pathHits(roundedPath(pts, R), ext, boxes, clear, ignore)
  if (!hits.length) return { pts, lift, entry, carry: null, front: !!(fs || fe) }
  let carry = -Infinity
  for (let k = 0; k < 8 && hits.length; k++) {
    const want = topOf(hits) + clear
    carry = want > carry ? want : carry + R   // (a hit below the carry height: a corner — go a little higher)
    pts = build(carry)
    hits = pathHits(roundedPath(pts, R), ext, boxes, clear, ignore)
  }
  return { pts, lift, entry, carry, front: !!(fs || fe), blocked: hits.length ? hits : null }
}
