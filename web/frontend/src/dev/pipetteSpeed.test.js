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
  it('two pipettes of one station (a P200, a P1000 at its own home) are two tracks: neither jumps to the other', () => {
    // each still at its own home, 0.81 apart; both recorded every frame
    const rows = Array.from({ length: 20 }, (_, k) => [k, 0, 0.5, 1 / 60, [0, 0, 2.4, 1.25, 'home', 1, 'P200'], [0, -0.55, 2.4, 0.65, 'home', 1, 'P1000']])
    expect(analyse(rows).teleports).toEqual([])
    // RED: as ONE track (the active one, swapped) the swap reads as a 0.81 jump
    const one = rows.map((r, k) => [r[0], r[1], r[2], r[3], (k < 10 ? r[4] : r[5]).slice(0, 6)])
    expect(analyse(one).teleports.length).toBe(1)
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
