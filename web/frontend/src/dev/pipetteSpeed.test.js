import { describe, it, expect } from 'vitest'
import { analyse } from './pipetteSpeed.js'

// a pipette (station index 0, active) moving along x by per-frame steps, with phases
function rec(steps, { start = 0, active = 0 } = {}) {
  let x = start, f = 0
  return steps.map(([dx, phase]) => { x += dx; f++; return [f, active, 0, 1 / 60, [0, x, 2, 0, phase, 1]] })
}
const desc = Array(20).fill([0.02, 'descent'])          // 1.2 u/s
const still = (n, ph = 'home') => Array(n).fill([0, ph])
describe('pipette speed — nothing faster than the descent, nothing jumps', () => {
  it('a run no faster than its descent is green', () => {
    const r = analyse(rec([...still(3), ...Array(30).fill([0.015, 'to source']), ...desc, ...Array(20).fill([0.021, 'return'])]))
    expect(r.fast).toEqual([]); expect(r.teleports).toEqual([])
    expect(r.stations[0].descent).toBeCloseTo(1.2, 5)
  })
  it('RED: a return 3× faster than the descent is a fast segment (after lift)', () => {
    const r = analyse(rec([...desc, ...Array(10).fill([0.06, 'return'])]))
    expect(r.fast.length).toBe(1)
    expect(r.fast[0]).toMatchObject({ where: 'after lift', phases: ['return'], frames: 10 })
    expect(r.fast[0].ratio).toBeCloseTo(3, 5)
  })
  it('RED: an approach faster than the descent is a fast segment (before descent)', () => {
    const r = analyse(rec([...Array(10).fill([0.04, 'to source']), ...desc]))
    expect(r.fast[0].where).toBe('before descent')
  })
  it('RED: a one-frame jump is a teleport', () => {
    const r = analyse(rec([...still(5), [0.5, 'home'], ...still(5), ...desc]))
    expect(r.teleports.length).toBe(1); expect(r.teleports[0].dist).toBeCloseTo(0.5, 5)
  })
  it('RED: a pipette that reappears elsewhere is a teleport', () => {
    const a = rec([...desc]), b = rec([...still(3)], { start: 3 }).map((row) => { row[0] += 40; return row })
    expect(analyse([...a, ...b]).teleports[0].kind).toBe('reappears elsewhere')
  })
})
