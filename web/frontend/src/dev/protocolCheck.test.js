import { describe, it, expect } from 'vitest'
import { passesFor, comparePasses, isolatedJump, createFinish, phaseSpeeds } from './protocolCheck.js'
import { generateProtocol, EDGE_VOLUMES } from './genProtocol.js'

describe('check-protocol — the pure rules, proven red', () => {
  it('one draw per substance, whatever its volume (schematic pipetting)', () => {
    for (const ul of [0.5, 200, 201, 1000, 1001, 50000]) expect(passesFor(ul)).toEqual([{ ul }])
    expect(passesFor(0)).toEqual([])
  })
  it('RED: one substance drawn in three portions is two draws too many', () => {
    const bad = comparePasses(passesFor(500), [{ ul: 200 }, { ul: 200 }, { ul: 100 }])
    expect(bad.length).toBe(3); expect(bad[1]).toMatch(/not called for/)
  })
  it('RED: two substances drawn as one is a draw missing', () => {
    expect(comparePasses([...passesFor(100), ...passesFor(30)], [{ ul: 130 }]).length).toBe(2)
  })
  it('per-phase peak speeds of a pipette track (u/s): the descent and the moves, each its own', () => {
    const fr = (phase, y, x = 0) => ({ phase, x, y, z: 0, dt: 0.1 })
    const sp = phaseSpeeds([fr('to source', 2, 0), fr('to source', 2, 0.5), fr('to source', 2, 1.5), fr('descent', 1.5, 1.5), fr('descent', 1.2, 1.5)])
    expect(sp.move).toBeCloseTo(10, 6)
    expect(sp.descent).toBeCloseTo(5, 6)
  })
  it('RED: a station is finished only once ITS p has run to 1 — a p still at 1 from the last station is not its end', () => {
    const f = createFinish(3)
    // the page still reads the previous station's p = 1 for the first frames
    expect([0, 1, 2, 3, 4].map((k) => f(k, 1, false))).toEqual([false, false, false, false, false])
    const g = createFinish(3)
    const ps = [1, 1, 0, 0.4, 0.9, 1, 1, 1, 1]
    expect(ps.map((p, k) => g(k, p, false))).toEqual([false, false, false, false, false, false, false, false, true])
    expect(f.ran).toBe(false); expect(g.ran).toBe(true)   // a clock that never ran is no run
    const h = createFinish(0)
    expect([0.2, 1, 1].map((p, k) => h(k, p, true))).toEqual([false, false, false])   // a vessel still arriving
  })
  it('RED: an isolated one-frame jump is a teleport; a fast but continuous move is not', () => {
    expect(isolatedJump(0, 0.5, 0)).toBe(true)
    expect(isolatedJump(0.4, 0.5, 0.45)).toBe(false)
    expect(isolatedJump(0, 0.01, 0)).toBe(false)
  })
  it('the generator is deterministic and covers every edge volume', () => {
    expect(JSON.stringify(generateProtocol(7))).toBe(JSON.stringify(generateProtocol(7)))
    const vols = new Set()
    for (let s = 1; s <= 50; s++) for (const st of generateProtocol(s).steps) for (const r of st.reagents) vols.add(r.volume)
    for (const v of EDGE_VOLUMES) expect(vols.has(v)).toBe(true)
  })
})
