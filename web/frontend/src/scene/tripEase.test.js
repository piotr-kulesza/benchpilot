import { describe, it, expect } from 'vitest'
import { transitionSeconds, tripEase, pointAlong } from './tripEase.js'
import { TRANSITION_DURATION } from './tempo.js'

describe('the station-change trip — its timing (path untouched)', () => {
  it('lasts TRANSITION_DURATION (3 s on screen), + 0.3 s per unit above 4 units, never over 4.5 s', () => {
    expect(TRANSITION_DURATION).toBe(3.0)
    expect(transitionSeconds(1)).toBeCloseTo(3.0, 9)
    expect(transitionSeconds(4)).toBeCloseTo(3.0, 9)
    expect(transitionSeconds(6)).toBeCloseTo(3.6, 9)
    expect(transitionSeconds(40)).toBeCloseTo(4.5, 9)
  })
  it('RED vs the old chase: a soft start, an even middle, a soft stop', () => {
    const h = 1e-4, v = (u) => (tripEase(u + h) - tripEase(u - h)) / (2 * h)
    expect(tripEase(0)).toBe(0); expect(tripEase(1)).toBe(1)
    expect(tripEase(1 / 180)).toBeLessThan(1e-4)           // the first frame of a 3 s trip: ~0 of the way
    expect(1 - Math.pow(0.02, 1 / 96)).toBeGreaterThan(0.03) // (e972bcf's chase covered 4 % in it)
    expect(tripEase(0.1)).toBeLessThan(0.05)                 // (the chase: 69 % in its first 0.3 s)
    expect(v(0.4)).toBeCloseTo(v(0.6), 6)                    // even middle
    expect(v(0.5)).toBeLessThan(1.5)                          // peak speed under 1.5 × the average
    for (let u = 0; u < 1; u += 0.01) expect(tripEase(u + 0.01)).toBeGreaterThanOrEqual(tripEase(u))
    // speed continuous at the ramps' ends (no jerk into the cruise)
    expect(v(0.3 - 1e-3)).toBeCloseTo(v(0.3 + 1e-3), 2)
  })
  it('the point at arc length s along the same polyline (out of a dock, then to the seat)', () => {
    const P = (x, y, z) => ({ x, y, z })
    const out = { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); return this } }
    pointAlong([P(0, 0, 0), P(0, 2, 0), P(4, 2, 0)], 1, out); expect([out.x, out.y]).toEqual([0, 1])
    pointAlong([P(0, 0, 0), P(0, 2, 0), P(4, 2, 0)], 3, out); expect([out.x, out.y]).toEqual([1, 2])
    pointAlong([P(0, 0, 0), P(0, 2, 0), P(4, 2, 0)], 99, out); expect([out.x, out.y]).toEqual([4, 2])
  })
})
