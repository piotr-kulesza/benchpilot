// motionPlan.test.js — ONE tempo for the whole scene: one top speed and one set of minimum durations,
// the same for every station and every protocol (red before motionPlan had them).
import { describe, it, expect } from 'vitest'
import { MAX_SPEED, CAMERA_MAX_SPEED, MIN_DUR, PEAK, segmentSeconds, passSeconds, PASS_KINDS, spread } from './motionPlan.js'

describe('one tempo — a global top speed and global minimum durations', () => {
  it('the camera and everything else share the one top speed', () => {
    expect(CAMERA_MAX_SPEED).toBe(MAX_SPEED)
  })
  it('a segment lasts what its distance takes at the top speed, never less than its kind\'s minimum', () => {
    expect(segmentSeconds('move', 6, PEAK.easeInOut)).toBeCloseTo(PEAK.easeInOut * 6 / MAX_SPEED, 9)
    expect(segmentSeconds('lift', 0.01, PEAK.easeInOut)).toBe(MIN_DUR.lift)
    expect(segmentSeconds('pause', 0)).toBe(MIN_DUR.pause)
    for (const k of ['move', 'descent', 'lift', 'pause']) expect(MIN_DUR[k]).toBeGreaterThan(0)
  })
  it('a pass is timed from its own geometry against the GLOBAL speed: equal descents take equal time at every station, and no segment peaks over the cap', () => {
    const a = passSeconds({ toSrc: 3.2, down: 1.6, up: 1.6, carry: 2.1, descent: 1.9, lift: 1.9, home: 3.5 }, true)
    const b = passSeconds({ toSrc: 8.0, down: 0.4, up: 0.4, carry: 6.0, descent: 1.9, lift: 1.9, home: 7.5 }, true)
    expect(a.length).toBe(PASS_KINDS.length)
    const iDesc = PASS_KINDS.lastIndexOf('descent')
    expect(a[iDesc]).toBeCloseTo(b[iDesc], 9)                     // the descent's time is its own — not set by the rest of the pass
    const dists = [3.2, 1.6, 0, 0, 1.6, 2.1, 1.9, 0, 1.9, 3.5]
    a.forEach((sec, i) => { if (dists[i] > 0) expect(PEAK.easeInOut * dists[i] / sec).toBeLessThanOrEqual(MAX_SPEED + 1e-9) })
  })
  it('spread: how far apart the stations\' speeds are (max / min − 1)', () => {
    expect(spread([5, 5, 5])).toBe(0)
    expect(spread([2.47, 9.92])).toBeCloseTo(9.92 / 2.47 - 1, 9)
    expect(spread([])).toBe(0)
  })
})
