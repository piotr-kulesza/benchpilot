import { describe, it, expect } from 'vitest'
import { compareRuns, cumOf } from './tempoProbe.js'

// the cumulative path of a smoothstep move of `n` tempo-1 frames (length `len`), played at
// `tempo`, after `lead` frames of rest; moves can be chained with a pause
function eased(n, tempo, len = 1, lead = 10) {
  const N = Math.round(n * tempo), out = Array(lead).fill(0)
  const f = (t) => t * t * (3 - 2 * t)
  for (let k = 1; k <= N; k++) out.push(len * (f(k / N) - f((k - 1) / N)))
  return out.concat(Array(lead).fill(0))
}
const T = 1.6
const run = (...moves) => cumOf(moves.flat())
describe('tempo probe — each motion segment must stretch by the tempo', () => {
  it('a motion on the tempo clock passes (ratio 1.6)', () => {
    const r = compareRuns({ pip: run(eased(90, 1)) }, { pip: run(eased(90, T)) }, T)
    expect(r.bad).toEqual([])
    expect(r.rows[0].ratio).toBeCloseTo(1.6, 2)
  })
  it('RED: a motion that keeps its own speed (ratio 1) fails', () => {
    const r = compareRuns({ pip: run(eased(90, 1)) }, { pip: run(eased(90, 1)) }, T)
    expect(r.bad.length).toBe(1)
    expect(r.bad[0].why).toMatch(/ratio 1\.0/)
  })
  it('RED: a motion half-scaled (ratio 1.3) fails', () => {
    const r = compareRuns({ lid: run(eased(60, 1)) }, { lid: run(eased(60, 1.3)) }, T)
    expect(r.bad.length).toBe(1)
  })
  it('RED: a short move (the plunger, 12 frames) that keeps its speed fails', () => {
    const r = compareRuns({ plunger: run(eased(12, 1, 0.05)) }, { plunger: run(eased(12, 1, 0.05)) }, T)
    expect(r.bad.length).toBe(1)
  })
  it('RED: only ONE of two moves bypassing the tempo is caught', () => {
    const r = compareRuns({ pip: run(eased(60, 1), eased(40, 1)) }, { pip: run(eased(60, T), eased(40, 1)) }, T)
    expect(r.rows.length).toBe(2); expect(r.bad.map((x) => x.i)).toEqual([1])
  })
  it('RED: a motion missing at the slow tempo fails; one only there too', () => {
    expect(compareRuns({ tube: run(eased(60, 1)) }, {}, T).bad[0].why).toMatch(/never makes/)
    expect(compareRuns({}, { tube: run(eased(60, T)) }, T).bad[0].why).toMatch(/only at the slow/)
  })
  it('an instant change (one sample) is listed, not timed', () => {
    const jump = [0, 0, 0, 0.5, 0, 0, 0]
    const r = compareRuns({ col: cumOf(jump) }, { col: cumOf(jump) }, T)
    expect(r.rows[0].instant).toBe(true); expect(r.bad).toEqual([])
  })
  it('a short move before a long one: each timed on its own (no shift)', () => {
    const r = compareRuns({ pip: run(eased(12, 1, 0.1), eased(90, 1)) }, { pip: run(eased(12, T, 0.1), eased(90, T)) }, T)
    expect(r.rows.length).toBe(2); expect(r.bad).toEqual([])
  })
  it('a near-pause that merges two moves at one tempo only changes nothing', () => {
    // at tempo 1 a 2-frame pause splits the moves; at 1.6 the same moves run back to back
    const a = run(eased(40, 1, 1, 10), eased(30, 1, 0.5, 2)), b = run(eased(40, T, 1, 16), eased(30, T, 0.5, 0))
    const r = compareRuns({ pip: a }, { pip: b }, T)
    expect(r.rows.length).toBe(2); expect(r.bad).toEqual([])
  })
})
