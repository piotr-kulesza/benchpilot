import { describe, it, expect } from 'vitest'
import { passesFor, comparePasses, isolatedJump, createFinish, phaseSpeeds, ndcInFrame, transitionVerdict, cameraStep, cameraJumps, CAM_JUMP, labelMoves, transitionCollisions, placedAtNext } from './protocolCheck.js'
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
  it('a vessel is in the frame when every corner of its box projects inside the view (NDC −1…1)', () => {
    expect(ndcInFrame([[0, 0], [0.9, -0.9], [-0.99, 0.99]])).toBe(true)
    expect(ndcInFrame([[0, 0], [1.2, 0]])).toBe(false)               // RED: one corner off the right edge
  })
  it('RED: a transition whose camera finishes after the vessel has set down, or loses it from the frame, is red', () => {
    expect(transitionVerdict({ vesselDone: 220, cameraDone: 200, outFrames: 0 })).toEqual([])
    expect(transitionVerdict({ vesselDone: 220, cameraDone: 240, outFrames: 0 })[0]).toMatch(/camera arrives 20 frames after/)
    expect(transitionVerdict({ vesselDone: 220, cameraDone: 200, outFrames: 31, firstOut: 12 })[0]).toMatch(/out of the frame in 31 frames/)
  })
  it('RED: a station-change trip faster than its TRANSITION_DURATION time, or one that starts at speed, is red', () => {
    expect(transitionVerdict({ vesselDone: 300, cameraDone: 290, outFrames: 0, tripFrames: 216, minFrames: 216, firstSpeed: 0.001, avgSpeed: 2 })).toEqual([])
    expect(transitionVerdict({ vesselDone: 300, cameraDone: 290, outFrames: 0, tripFrames: 140, minFrames: 216, firstSpeed: 0, avgSpeed: 2 })[0]).toMatch(/2\.33 s — faster than its 3\.60 s/)
    expect(transitionVerdict({ vesselDone: 300, cameraDone: 290, outFrames: 0, tripFrames: 216, minFrames: 216, firstSpeed: 20, avgSpeed: 2 })[0]).toMatch(/starts at speed/)
  })
  it('RED: the camera never cuts or jumps — its step between frames in position and in rotation is held to CAM_JUMP', () => {
    const pose = (x, y, z, q = [0, 0, 0, 1]) => ({ p: [x, y, z], q })
    expect(cameraStep(pose(0, 0, 0), pose(0.05, 0, 0)).dPos).toBeCloseTo(0.05, 9)
    const half = Math.SQRT1_2
    expect(cameraStep(pose(0, 0, 0), pose(0, 0, 0, [0, Math.sin(Math.PI / 360), 0, Math.cos(Math.PI / 360)])).dRot).toBeCloseTo(1, 6)   // 1°
    expect(cameraStep(pose(0, 0, 0, [0, 0, 0, 1]), pose(0, 0, 0, [0, 0, 0, -1])).dRot).toBeCloseTo(0, 6)                                 // q ≡ −q
    // a smooth glide: no jump; a framing switch (0.632 down in one frame) and a sway snap: jumps
    const glide = Array.from({ length: 60 }, (_, k) => pose(k * 0.08, 3, 9))
    expect(cameraJumps(glide)).toEqual([])
    const cut = [...glide.slice(0, 30), ...glide.slice(30).map((c) => pose(c.p[0], 3 - 0.632, 9))]
    const j = cameraJumps(cut)
    expect(j.length).toBe(1); expect(j[0].frame).toBe(30); expect(j[0].dPos).toBeGreaterThan(CAM_JUMP.pos)
    const turn = [pose(0, 3, 9), pose(0, 3, 9, [0, half, 0, half])]
    expect(cameraJumps(turn)[0].dRot).toBeCloseTo(90, 4)
  })
  it('RED: a label moves — any change of its place between two frames of a station', () => {
    const a = new Map([['Centrifuge', [18.2, 3.1, 0]], ['tube', [5, 1, 0]]])
    expect(labelMoves(a, new Map(a))).toEqual([])
    const b = new Map([['Centrifuge', [18.2, 3.16, 0]], ['tube', [5, 1, 0]], ['new', [0, 0, 0]]])
    const m = labelMoves(a, b)
    expect(m.length).toBe(1); expect(m[0].label).toBe('Centrifuge'); expect(m[0].d).toBeCloseTo(0.06, 9)
  })
  it('RED: a collision that begins while a vessel is on its way to the station is the TRIP\'s', () => {
    const c = [{ check: 'sweep', a: 'sample Tube', b: 'prev · IceBucket', frame: 12 }, { check: 'intersect', a: 'pipette', b: 'Bottle', frame: 400 }]
    expect(transitionCollisions(c, 250).map((x) => x.b)).toEqual(['prev · IceBucket'])
    expect(transitionCollisions(c, -1)).toEqual([])
  })
  it('RED: a vessel placed in one frame at Next (shown before and after, moved in the first frames) is a teleport', () => {
    const before = [{ key: 'column', shown: true, p: [67.2, 0, 0] }, { key: 'tube', shown: false, p: [0, 0, 0] }, { key: 'prep:1', shown: true, p: [60, 0, 0] }]
    const after = [{ key: 'column', shown: true, p: [74.1, 0, 0.5] }, { key: 'tube', shown: true, p: [75, 0, 0] }, { key: 'prep:1', shown: true, p: [60.01, 0.002, 0] }]
    const t = placedAtNext(before, after)
    expect(t.length).toBe(1); expect(t[0].key).toBe('column'); expect(t[0].dist).toBeGreaterThan(6)
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
