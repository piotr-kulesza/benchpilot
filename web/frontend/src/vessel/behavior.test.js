import { describe, it, expect } from 'vitest'
import { BEHAVIORS, resolveBehavior } from './behavior.js'
import { ACTIONS } from '../lib/runtime.js'

// The 3D scene itself isn't unit-tested (no GPU in CI). What we DO guarantee is
// the action → behavior mapping: every action in the vocabulary resolves to a
// behavior descriptor, and anything unknown falls back to `generic`.

describe('action → vessel behavior mapping', () => {
  it('resolves every action enum value to a behavior descriptor', () => {
    for (const action of ACTIONS) {
      const bh = resolveBehavior(action)
      expect(bh).toBeTypeOf('object')
      expect(bh).toBe(BEHAVIORS[action])
      expect(bh).toHaveProperty('fill')
    }
  })

  it('has exactly one entry per vocabulary value and no extras', () => {
    expect(Object.keys(BEHAVIORS).sort()).toEqual([...ACTIONS].sort())
  })

  it('falls back to generic for unknown / missing actions', () => {
    expect(resolveBehavior('does_not_exist')).toBe(BEHAVIORS.generic)
    expect(resolveBehavior(undefined)).toBe(BEHAVIORS.generic)
    expect(resolveBehavior('')).toBe(BEHAVIORS.generic)
  })
})
