import { describe, it, expect } from 'vitest'
import { SCENE_RECIPES, resolveRecipe, sampleContainerSequence } from './sceneRecipe.js'
import { resolveBehavior } from './behavior.js'
import { ACTIONS } from '../lib/runtime.js'

// The 3D scene isn't unit-tested (no GPU in CI). What we DO guarantee is the
// action → scene-recipe mapping: every action in the vocabulary resolves to a
// valid recipe (equipment + vessel + anim + handoff), and anything unknown
// falls back to `generic`.

const EQUIPMENT = new Set([
  'centrifuge', 'incubation_block', 'heat_block', 'ice_bucket',
  'spin_column', 'bottle_pipette', 'reader', 'bench',
])
const VESSELS = new Set(['microtube', 'spin_column', 'bottle', 'eluate_tube'])

describe('action → scene recipe mapping', () => {
  it('resolves every action enum value to a valid recipe', () => {
    for (const action of ACTIONS) {
      const r = resolveRecipe(action)
      expect(r, action).toBeTypeOf('object')
      expect(r, action).toBe(SCENE_RECIPES[action])
      expect(EQUIPMENT.has(r.equipment), `${action} equipment=${r.equipment}`).toBe(true)
      expect(VESSELS.has(r.vessel), `${action} vessel=${r.vessel}`).toBe(true)
      expect(r.handoff).toBeTypeOf('boolean')
      // anim is the action's behavior descriptor, kept in lockstep with behavior.js
      expect(r.anim).toBe(resolveBehavior(action))
      expect(r.anim).toHaveProperty('fill')
    }
  })

  it('has exactly one entry per vocabulary value and no extras', () => {
    expect(Object.keys(SCENE_RECIPES).sort()).toEqual([...ACTIONS].sort())
  })

  it('marks transfer and elute as hand-offs (sample changes container)', () => {
    expect(resolveRecipe('transfer').handoff).toBe(true)
    expect(resolveRecipe('elute').handoff).toBe(true)
    expect(resolveRecipe('centrifuge').handoff).toBe(false)
  })

  it('falls back to generic for unknown / missing actions', () => {
    expect(resolveRecipe('does_not_exist')).toBe(SCENE_RECIPES.generic)
    expect(resolveRecipe(undefined)).toBe(SCENE_RECIPES.generic)
    expect(resolveRecipe('')).toBe(SCENE_RECIPES.generic)
    expect(resolveRecipe(null)).toBe(SCENE_RECIPES.generic)
  })
})

describe('travelling sample container sequence', () => {
  it('starts as a microtube and changes only at hand-offs', () => {
    // microtube … until transfer → spin column … until elute → eluate tube
    const actions = ['pour_add', 'pipette_mix', 'transfer', 'wash', 'incubate_wait', 'elute', 'measure', 'cool_ice']
    expect(sampleContainerSequence(actions)).toEqual([
      'microtube', // pour_add (as step begins)
      'microtube', // pipette_mix
      'microtube', // transfer — hand-off happens AT the end of this step
      'spin_column', // wash
      'spin_column', // incubate_wait
      'spin_column', // elute — hand-off at the end
      'eluate_tube', // measure
      'eluate_tube', // cool_ice
    ])
  })

  it('never changes container without a transfer/elute (unknown actions included)', () => {
    const seq = sampleContainerSequence(['pour_add', 'centrifuge', 'does_not_exist', 'heat'])
    expect(seq).toEqual(['microtube', 'microtube', 'microtube', 'microtube'])
  })

  it('handles an empty protocol', () => {
    expect(sampleContainerSequence([])).toEqual([])
    expect(sampleContainerSequence()).toEqual([])
  })
})
