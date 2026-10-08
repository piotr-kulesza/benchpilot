import { describe, it, expect } from 'vitest'
import { passesFor, comparePasses, isolatedJump, createFinish } from './protocolCheck.js'
import { generateProtocol, EDGE_VOLUMES } from './genProtocol.js'

describe('check-protocol — the pure rules, proven red', () => {
  it('rule 1: the pipette a volume calls for', () => {
    expect(passesFor(0.5)).toEqual([{ kind: 'P200', ul: 0.5 }])
    expect(passesFor(200)).toEqual([{ kind: 'P200', ul: 200 }])
    expect(passesFor(201)).toEqual([{ kind: 'P1000', ul: 201 }])
    expect(passesFor(1000)).toEqual([{ kind: 'P1000', ul: 1000 }])
    expect(passesFor(1001)).toEqual([{ kind: 'P1000', ul: 500.5 }, { kind: 'P1000', ul: 500.5 }])
    expect(passesFor(0)).toEqual([])
  })
  it('RED: 500 µl in three P200 passes is not one P1000 pass', () => {
    const bad = comparePasses(passesFor(500), [{ kind: 'P200', ul: 200 }, { kind: 'P200', ul: 200 }, { kind: 'P200', ul: 100 }])
    expect(bad.length).toBe(3); expect(bad[0]).toMatch(/needs a P1000, drawn with a P200/)
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
  it('RED: a 1001 µl move drawn as one pass is missing its second', () => {
    expect(comparePasses(passesFor(1001), [{ kind: 'P1000', ul: 1001 }]).length).toBe(2)
  })
  it('the right passes are green', () => {
    expect(comparePasses(passesFor(350), [{ kind: 'P1000', ul: 350 }])).toEqual([])
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
