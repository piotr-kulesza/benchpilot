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
export function pathHits(pts, extOf, boxes, clear = TRIP_CLEAR, ignore = null, first = false) {
  const hit = new Set()
  const at = (p) => {
    const ext = typeof extOf === 'function' ? extOf(p) : extOf
    // (each side its own: a vessel need not be centred on its origin — nx/px, nz/pz; rx/rz when it is)
    const v = { min: P(p.x - (ext.nx ?? ext.rx) - clear, p.y - ext.below - clear, p.z - (ext.nz ?? ext.rz) - clear), max: P(p.x + (ext.px ?? ext.rx) + clear, p.y + ext.above + clear, p.z + (ext.pz ?? ext.rz) + clear) }
    // (a box may refine its test: b.hit(v) — the part's own oriented box, not its world AABB: a door standing
    // open on the diagonal filled an AABB the vessel's way passed through)
    boxes.forEach((b, i) => { if (!hit.has(i) && touches(b, v, -1e-9) && (!b.hit || b.hit(v)) && !(ignore && ignore(p, i))) hit.add(i) })
  }
  for (let i = 0; i < pts.length; i++) {
    if (first && hit.size) break   // (a yes / no is enough)
    if (i === 0) { at(pts[0]); continue }
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(1, Math.ceil(d / STEP))
    for (let k = 1; k <= n; k++) at(P(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, a.z + (b.z - a.z) * k / n))
  }
  return [...hit]
}

// { pts (the vertices; roundedPath(pts) is the way), lift (the foot's height out of what held it, or null),
//   entry (the same over its seat), carry (the foot's height over what was in the way, or null),
//   front (out through the front of what stands over it — a freezer's shelf, an arm — before it rises) }
// ext: the vessel's extent between the stations (the larger of its two sizes); extStart / extSeat: as it is on its
// way out of its start / into its seat (its size changes only between)
export function planTrip({ start, seat, ext, extStart = ext, extSeat = ext, boxes, startBox = null, seatBox = null, clear = TRIP_CLEAR, R = TRIP_ROUND }) {
  const foot = (a, b) => a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z
  // what HOLDS it: what its box touches, not what stands over it; what stands OVER it: a solid over its footprint
  const holders = (vb) => (vb ? boxes.map((b, i) => (touches(b, vb, clear + 0.005) && (!b.hit || b.hit(grow(vb, clear + 0.005))) && b.min.y < vb.max.y - 0.02 ? i : -1)).filter((i) => i >= 0) : [])
  const over = (vb, hs) => (vb ? boxes.map((b, i) => (!hs.includes(i) && foot(b, vb) && b.min.y >= vb.max.y - 0.02 ? i : -1)).filter((i) => i >= 0) : [])
  const hs0 = holders(startBox), he0 = holders(seatBox)
  const os = over(startBox, hs0), oe = over(seatBox, he0)
  const topOf = (ids) => Math.max(...ids.map((i) => boxes[i].max.y))
  const shift = (vb, p, q) => (vb ? { min: P(vb.min.x + q.x - p.x, vb.min.y + q.y - p.y, vb.min.z + q.z - p.z), max: P(vb.max.x + q.x - p.x, vb.max.y + q.y - p.y, vb.max.z + q.z - p.z) } : null)
  // out through the FRONT (+z, toward the viewer) first, at its own height, until clear of what holds it and what
  // stands over it; it goes into such a seat the same way, in from the front
  const frontOf = (ids, p, e) => P(p.x, p.y, Math.max(...ids.map((i) => boxes[i].max.z)) + clear + (e.nz ?? e.rz) + R)
  const onAxis = (p, q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.z - q.z) < 1e-6
  const onFront = (p, q, f) => f && Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6 && p.z >= q.z - 1e-6 && p.z <= f.z + 1e-6
  const attempt = (useFs, useFe) => {
    const fs = useFs ? frontOf([...hs0, ...os], start, extStart) : null, fe = useFe ? frontOf([...he0, ...oe], seat, extSeat) : null
    const s0 = fs || start, e0 = fe || seat
    const hs = fs ? holders(shift(startBox, start, fs)) : hs0, he = fe ? holders(shift(seatBox, seat, fe)) : he0
    const lift = hs.length ? topOf(hs) + clear : null, entry = he.length ? topOf(he) + clear : null
    const above = (p, f, e) => P(p.x, Math.max(p.y, f + e.below + R), p.z)
    // what holds it does not count on its way straight up out of it (or down into its seat), nor on its way
    // out of the front of it
    const ignore = (p, i) => (hs.includes(i) && onAxis(p, s0)) || (he.includes(i) && onAxis(p, e0)) ||
      (hs0.includes(i) && onFront(p, start, fs)) || (he0.includes(i) && onFront(p, seat, fe))
    const extOf = (p) => (onAxis(p, s0) || onFront(p, start, fs) ? extStart : onAxis(p, e0) || onFront(p, seat, fe) ? extSeat : ext)
    const build = (carry) => {
      const q = [P(start.x, start.y, start.z)]
      if (fs) q.push(fs)
      const f = carry != null ? Math.max(carry, lift ?? -Infinity) : lift
      if (f != null) q.push(above(s0, f, extStart))
      const g = carry != null ? Math.max(carry, entry ?? -Infinity) : entry
      if (g != null) q.push(above(e0, g, extSeat))
      if (fe) q.push(fe)
      q.push(P(seat.x, seat.y, seat.z))
      return q.filter((p, i) => i === 0 || !same(p, q[i - 1]))
    }
    let pts = build(null), carry = null, carryBy = null
    const tried = []
    let hits = pathHits(roundedPath(pts, R), extOf, boxes, clear, ignore)
    if (hits.length) {
      // the LOWEST carry height (none, then each solid's top + TRIP_CLEAR, lowest first), each with the least
      // swing ASIDE (back or forward, at most 1.0) that clears the way — rounded into one arc. (Raised to the top
      // of whatever it last met, a plate climbed into a pipette hanging at its home and was carried 4.5 high;
      // a plate grazing a stand's pole by 0.02 needs only a swing of 0.1 over the stand's low foot.)
      const tops = [null, ...[...new Set(boxes.map((b) => +(b.max.y + clear).toFixed(6)))].sort((x, y) => x - y)]
      const swings = [0]; for (let k = 1; k <= 20; k++) swings.push(-k * 0.05, k * 0.05)
      let best = null
      search: for (const c of tops) {
        const q0 = build(c)
        const A = q0.findIndex((p, i) => i > 0 && !onAxis(p, s0) && !onFront(p, start, fs)) - 1
        const B = q0.length - 1 - [...q0].reverse().findIndex((p, i) => i > 0 && !onAxis(p, e0) && !onFront(p, seat, fe)) + 1
        for (const dz of swings) {
          let q = q0
          if (dz) {
            if (!(A >= 0 && B > A)) continue
            const a = q0[A], b = q0[B], at = (f) => P(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f + dz)
            q = [...q0.slice(0, A + 1), at(0.12), at(0.88), ...q0.slice(B)]
          }
          const h = pathHits(roundedPath(q, R), extOf, boxes, clear, ignore, true)
          if (!dz) tried.push([c == null ? null : +c.toFixed(2), h.slice(0, 3)])
          if (!h.length) { best = { q, c, h }; break search }
          if (!best) best = { q, c, h }
        }
      }
      if (best.h.length) {   // nothing clears: the carry (no swing) that meets the fewest
        best = null
        for (const c of tops) {
          const q = build(c), h = pathHits(roundedPath(q, R), extOf, boxes, clear, ignore)
          if (!best || h.length < best.h.length) best = { q, c, h }
        }
      }
      pts = best.q; carry = best.c; hits = best.h
      carryBy = carry == null ? [] : boxes.map((b, i) => (Math.abs(b.max.y + clear - carry) < 1e-6 ? i : -1)).filter((i) => i >= 0)
    }
    const hitOver = { s: hits.some((i) => os.includes(i)), e: hits.some((i) => oe.includes(i)) }
    return { pts, lift, entry, carry, carryBy, tried, front: !!(fs || fe), blocked: hits.length ? hits : null, hitOver }
  }
  let t = attempt(false, false)
  if (t.blocked && (t.hitOver.s || t.hitOver.e)) {
    const u = attempt(t.hitOver.s || false, t.hitOver.e || false)
    if (!u.blocked || u.blocked.length < t.blocked.length) t = u
    if (t.blocked && os.length && oe.length) { const w = attempt(true, true); if (!w.blocked) t = w }
  }
  delete t.hitOver
  return t
}
