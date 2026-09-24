import { describe, it, expect, afterEach } from 'vitest'
import { createRngStreams } from './rng.js'

// Each builder draws from ITS OWN seeded stream, so a change in how many random values
// one builder takes can no longer shuffle the placements in any other builder (the noise
// that made "pre vs current" diffs show ice cubes and bubbles moving for no reason).
describe('per-builder random streams', () => {
  const real = Math.random
  afterEach(() => { Math.random = real })

  const draws = (n) => () => Array.from({ length: n }, () => Math.random())

  it('a builder\'s draws do not depend on how many draws another builder took', () => {
    const run = (nA) => {
      const S = createRngStreams(() => 12345)
      const a = S.wrap('buildA', draws(nA))
      const b = S.wrap('buildB', draws(3))
      a(); return b()
    }
    expect(run(2)).toEqual(run(50))
  })
  it('is deterministic for a base seed, and different builders differ', () => {
    const S1 = createRngStreams(() => 7), S2 = createRngStreams(() => 7)
    const x = S1.wrap('buildA', draws(3))(), y = S2.wrap('buildA', draws(3))()
    expect(x).toEqual(y)
    expect(createRngStreams(() => 7).wrap('buildB', draws(3))()).not.toEqual(x)
  })
  it('the k-th call of a builder is stable regardless of other builders', () => {
    const second = (other) => {
      const S = createRngStreams(() => 99)
      const a = S.wrap('buildA', draws(2)), o = S.wrap('buildO', draws(other))
      a(); o(); return a()
    }
    expect(second(1)).toEqual(second(40))
  })
  it('restores Math.random afterwards — even on throw — and nests', () => {
    const S = createRngStreams(() => 1)
    const inner = S.wrap('inner', draws(5))
    const outer = S.wrap('outer', () => { const a = Math.random(); inner(); return [a, Math.random()] })
    const outer2 = createRngStreams(() => 1).wrap('outer', () => [Math.random(), Math.random()])
    expect(outer()).toEqual(outer2())                // inner's draws never shift outer's
    expect(Math.random).toBe(real)
    const boom = S.wrap('boom', () => { throw new Error('x') })
    expect(() => boom()).toThrow('x')
    expect(Math.random).toBe(real)
  })
  it('passes arguments and return values through', () => {
    const f = createRngStreams(() => 1).wrap('f', (a, b) => a + b)
    expect(f(2, 3)).toBe(5)
  })
})
