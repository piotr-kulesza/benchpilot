import { describe, it, expect } from 'vitest'
import { ANIMATIONS, resolveAnimation } from './actions.jsx'
import { ACTIONS } from '../lib/runtime.js'

describe('animation registry covers the whole action vocabulary', () => {
  it('resolves every action enum value to a component (no missing case)', () => {
    for (const action of ACTIONS) {
      const Comp = resolveAnimation(action)
      expect(typeof Comp).toBe('function')
    }
  })

  it('has exactly one entry per vocabulary value and no extras', () => {
    expect(Object.keys(ANIMATIONS).sort()).toEqual([...ACTIONS].sort())
  })

  it('falls back to the generic component for unknown / missing actions', () => {
    expect(resolveAnimation('does_not_exist')).toBe(ANIMATIONS.generic)
    expect(resolveAnimation(undefined)).toBe(ANIMATIONS.generic)
    expect(resolveAnimation('')).toBe(ANIMATIONS.generic)
  })
})
