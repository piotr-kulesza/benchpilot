import { describe, it, expect } from 'vitest'
import { planTrip, roundedPath, pathHits, TRIP_CLEAR } from './tripPath.js'

const box = (x0, y0, z0, x1, y1, z1) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } })
const ext = { below: 0, above: 1, rx: 0.2, rz: 0.2 }   // a tube: origin at its foot, 1 tall
const P = (x, y, z) => ({ x, y, z })

describe('a trip between stations — straight where free, over what is in the way (its timing elsewhere)', () => {
  it('nothing in the way: the straight line', () => {
    const t = planTrip({ start: P(0, 0, 0), seat: P(8.4, 0, 0), ext, boxes: [box(3, 0, 3, 4, 1, 4)] })
    expect(t.pts).toEqual([P(0, 0, 0), P(8.4, 0, 0)])
  })
  it('RED: a straight line through a bottle is blocked; the trip goes over it, clear by TRIP_CLEAR', () => {
    const bottle = box(4, 0, -0.3, 4.6, 1.3, 0.3)
    expect(pathHits([P(0, 0, 0), P(8.4, 0, 0)], ext, [bottle]).length).toBeGreaterThan(0)
    const t = planTrip({ start: P(0, 0, 0), seat: P(8.4, 0, 0), ext, boxes: [bottle] })
    const dense = roundedPath(t.pts)
    expect(pathHits(dense, ext, [bottle], TRIP_CLEAR - 1e-6)).toEqual([])
    const top = Math.max(...dense.map((p) => p.y))
    expect(top).toBeLessThan(1.3 + TRIP_CLEAR + 0.3)                     // not higher than it needs
    expect(dense[0]).toEqual(P(0, 0, 0)); expect(dense[dense.length - 1]).toEqual(P(8.4, 0, 0))
  })
  it('RED: out of what holds it (a rotor in its shell) straight up to its rim + TRIP_CLEAR, not to 2.15', () => {
    const shell = box(-0.8, 0, -0.8, 0.8, 1.0, 0.8)
    const start = P(0, 0.4, 0)
    const t = planTrip({ start, seat: P(8.4, 0, 0), ext, boxes: [shell], startBox: box(-0.2, 0.4, -0.2, 0.2, 1.4, 0.2) })
    const dense = roundedPath(t.pts)
    // it leaves vertically: no sideways move until its foot is over the rim + clearance
    for (const p of dense) if (Math.hypot(p.x - start.x, p.z - start.z) > 1e-6) { expect(p.y).toBeGreaterThanOrEqual(1.0 + TRIP_CLEAR - 1e-6); break }
    expect(Math.max(...dense.map((p) => p.y))).toBeLessThan(1.0 + TRIP_CLEAR + 0.2)
    expect(t.lift).toBeCloseTo(1.0 + TRIP_CLEAR, 9)
  })
  it('RED: under a shelf (a freezer) it goes out through the front first, never up through the shelf', () => {
    const body = box(-0.8, 0, -1.2, 0.8, 3.0, 0.3), shelf = box(-0.8, 2.4, -1.2, 0.8, 2.6, 0.3)
    const start = P(0, 1.3, -0.5), startBox = box(-0.2, 1.3, -0.7, 0.2, 2.3, -0.3)
    const t = planTrip({ start, seat: P(8.4, 0, 0), ext, boxes: [body, shelf], startBox })
    const d = roundedPath(t.pts)
    expect(t.front).toBe(true)
    // nothing over its footprint is crossed: while it is under the shelf (z < shelf front) it stays below it
    for (const p of d) if (p.z + ext.rz < 0.3 && Math.abs(p.x) < 0.8) expect(p.y + ext.above).toBeLessThanOrEqual(2.4 + 1e-6)
  })
  it('a part tested by its own (oriented) box: a diagonal door whose world AABB the way crosses, but not the door, is no obstacle', () => {
    const door = { ...box(3.5, 0, -0.65, 4.6, 3.5, 1.3), hit: () => false }
    const t = planTrip({ start: P(0, 0, 0), seat: P(8.4, 0, 0), ext, boxes: [door] })
    expect(t.pts).toEqual([P(0, 0, 0), P(8.4, 0, 0)])
    const solid = { ...door, hit: () => true }, u = planTrip({ start: P(0, 0, 0), seat: P(8.4, 0, 0), ext, boxes: [solid] })
    expect(u.pts.length).toBeGreaterThan(2)                                         // (a door that IS in the way is gone round or over)
    expect(pathHits(roundedPath(u.pts), ext, [solid], TRIP_CLEAR - 1e-6)).toEqual([])
  })
  it('RED: a pipette waiting over its seat is not passed over (carried ever higher): it goes in from the front, under it', () => {
    const pip = box(8.2, 1.2, -0.2, 8.6, 3.0, 0.2)   // over the seat's footprint, its foot 0.2 over the vessel's top
    const seatBox = box(8.2, 0, -0.2, 8.6, 1.0, 0.2)
    const bottle = box(4, 0, -0.3, 4.6, 1.3, 0.3)   // (in the middle: the way is carried over it)
    const t = planTrip({ start: P(0, 0, 0), seat: P(8.4, 0, 0), ext, boxes: [pip, bottle], seatBox })
    expect(t.blocked).toBeFalsy()
    expect(pathHits(roundedPath(t.pts), ext, [pip], TRIP_CLEAR - 1e-6)).toEqual([])
    expect(Math.max(...roundedPath(t.pts).map((p) => p.y))).toBeLessThan(1.3 + TRIP_CLEAR + 0.2)
  })
  it('RED: into a small seat (a thermocycler well) it is tested at its SEAT size there, not at its size on the way', () => {
    const walls = [box(7.9, 0.75, -0.5, 8.23, 0.87, 0.5), box(8.57, 0.75, -0.5, 8.9, 0.87, 0.5), box(8.23, 0.75, -0.5, 8.57, 0.87, -0.17), box(8.23, 0.75, 0.17, 8.57, 0.87, 0.5)]
    const big = { below: 0, above: 1.72, rx: 0.35, rz: 0.35 }, small = { below: 0, above: 0.76, rx: 0.15, rz: 0.15 }
    const seat = P(8.4, 0.08, 0), seatBox = box(8.25, 0.08, -0.15, 8.55, 0.84, 0.15)
    const t = planTrip({ start: P(0, 0, 0), seat, ext: big, extStart: big, extSeat: small, boxes: walls, seatBox })
    expect(t.blocked).toBeFalsy()
    expect(t.entry).toBeCloseTo(0.87 + TRIP_CLEAR, 9)                          // straight down into it from over its rim
    expect(Math.max(...roundedPath(t.pts).map((p) => p.y))).toBeLessThan(0.87 + TRIP_CLEAR + 0.2)
  })
  it('RED: under what hangs high (a pipette at its home over the way) it passes beneath, at the lowest clear height', () => {
    const rack = box(3, 0, -0.3, 3.6, 1.0, 0.3), pip = box(5.5, 3.4, -0.2, 5.7, 4.5, 0.2)
    const t = planTrip({ start: P(0, 0, 0), seat: P(8.4, 0, 0), ext, boxes: [rack, pip] })
    expect(t.blocked).toBeFalsy()
    expect(Math.max(...roundedPath(t.pts).map((p) => p.y))).toBeLessThan(1.0 + TRIP_CLEAR + 0.2)
  })
  it('RED: a tall pole its edge grazes is passed by a slight swing aside, not carried over (3 units high)', () => {
    const pole = box(5.5, 0.1, 0.23, 5.7, 3.1, 0.45)
    const t = planTrip({ start: P(0, 0, 0), seat: P(8.4, 0, 0), ext, boxes: [pole] })
    const d = roundedPath(t.pts)
    expect(t.blocked).toBeFalsy()
    expect(Math.max(...d.map((p) => p.y))).toBeLessThan(0.01)
    expect(Math.min(...d.map((p) => p.z))).toBeGreaterThan(-0.2)
    expect(pathHits(d, ext, [pole], TRIP_CLEAR - 1e-6)).toEqual([])
  })
  it('the rounded path is smooth: no corner (the direction turns gradually)', () => {
    const t = planTrip({ start: P(0, 0, 0), seat: P(8.4, 0, 0), ext, boxes: [box(4, 0, -0.3, 4.6, 1.3, 0.3)] })
    const d = roundedPath(t.pts)
    let worst = 0
    for (let i = 2; i < d.length; i++) {
      const a = [d[i - 1].x - d[i - 2].x, d[i - 1].y - d[i - 2].y], b = [d[i].x - d[i - 1].x, d[i].y - d[i - 1].y]
      const la = Math.hypot(...a), lb = Math.hypot(...b)
      if (la < 1e-9 || lb < 1e-9) continue
      worst = Math.max(worst, Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1]) / la / lb)))
    }
    expect(worst).toBeLessThan(0.25)   // radians per sample
  })
})
