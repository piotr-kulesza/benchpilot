// motionAudit.test.js — the motion check goes red on a teleport, a pop, a linear move and an
// exponential chase; an eased move passes.
import { describe, it, expect } from 'vitest'
import { auditTrack } from './motionAudit.js'

const Q = [0, 0, 0, 1]
const at = (x, visible = true) => ({ pos: [x, 0, 0], quat: Q, visible })
const rest = (x, n) => Array.from({ length: n }, () => at(x))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const checks = (f) => f.map((x) => x.check)

describe('motion audit', () => {
  it('an eased move (cubic in-out over 40 frames) → green', () => {
    const tr = [...rest(0, 10), ...Array.from({ length: 41 }, (_, k) => at(ease(k / 40))), ...rest(1, 10)]
    expect(checks(auditTrack(tr))).toEqual([])
  })
  it('a residual turn barely above rest (float noise, 3e-4 rad/frame) → green; a real linear turn → abrupt', () => {
    const rq = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]
    const turn = (step) => [...Array.from({ length: 10 }, () => ({ pos: [0, 0, 0], quat: rq(0), visible: true })),
      ...Array.from({ length: 20 }, (_, k) => ({ pos: [0, 0, 0], quat: rq(step * (k + 1)), visible: true })),
      ...Array.from({ length: 10 }, () => ({ pos: [0, 0, 0], quat: rq(step * 20), visible: true }))]
    expect(checks(auditTrack(turn(3e-4)))).toEqual([])
    expect(checks(auditTrack(turn(0.02))).sort()).toEqual(['abrupt-start', 'abrupt-stop'])
  })
  it('a linear move → abrupt start and abrupt stop', () => {
    const tr = [...rest(0, 10), ...Array.from({ length: 41 }, (_, k) => at(k / 40)), ...rest(1, 10)]
    expect(checks(auditTrack(tr)).sort()).toEqual(['abrupt-start', 'abrupt-stop'])
  })
  it('an exponential chase (lerp toward the goal each frame) → abrupt start only', () => {
    const tr = rest(0, 10); let x = 0
    for (let k = 0; k < 120; k++) { x += (1 - x) * (1 - Math.pow(0.02, 1 / 60)); tr.push(at(x)) }
    tr.push(...rest(1, 10))
    expect(checks(auditTrack(tr))).toEqual(['abrupt-start'])
  })
  it('a one-frame jump with rest around it → teleport', () => {
    expect(checks(auditTrack([...rest(0, 10), ...rest(0.8, 10)]))).toEqual(['teleport'])
  })
  it('appearing mid-step → teleport (a pop)', () => {
    const tr = [...rest(0, 5).map((p) => ({ ...p, visible: false })), ...rest(0, 5)]
    const f = auditTrack(tr)
    expect(checks(f)).toEqual(['teleport']); expect(f[0].how).toBe('appears')
  })
  it('appearing OFF screen (and travelling in) → green', () => {
    const tr = [...rest(0, 5).map((p) => ({ ...p, visible: false, inView: false })), ...rest(0, 5).map((p) => ({ ...p, inView: false }))]
    expect(checks(auditTrack(tr))).toEqual([])
  })
  it('a move from the first frame of a thing known to be at rest before → judged (a real start)', () => {
    const tr = [at(0), ...Array.from({ length: 40 }, (_, k) => at((k + 1) / 40)), ...rest(1, 10)]
    expect(checks(auditTrack(tr, { restBefore: true })).sort()).toEqual(['abrupt-start', 'abrupt-stop'])
  })
  it('a move already under way when the window opens, or still going when it closes, is not judged there', () => {
    const tr = Array.from({ length: 41 }, (_, k) => at(k / 40))
    expect(checks(auditTrack(tr))).toEqual([])
  })
})
