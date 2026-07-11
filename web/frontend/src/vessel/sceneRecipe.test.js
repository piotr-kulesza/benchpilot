import { describe, it, expect } from 'vitest'
import {
  SCENE_RECIPES, resolveRecipe, sampleContainerSequence, resolveContainer, resolveRemoval,
} from './sceneRecipe.js'
import { resolveBehavior } from './behavior.js'
import { ACTIONS } from '../lib/runtime.js'

// The 3D scene isn't unit-tested (no GPU in CI). What we DO guarantee is that the
// two decoupled axes resolve: every action → a valid { equipment, anim } recipe,
// and every container → a valid { geo, removal }; anything unknown falls back.

const EQUIPMENT = new Set([
  'centrifuge', 'incubation_block', 'heat_block', 'ice_bucket',
  'bottle_pipette', 'reader', 'syringe', 'bench',
  'thermocycler', 'gel_rig', 'freezer', 'staining_tray',
])
const CONTAINERS = [
  'microtube', 'tube', 'well_plate', 'flask', 'dish', 'gel', 'slide',
  'cryovial', 'membrane', 'spin_column', 'eluate_tube', 'bottle', 'agar_plate', 'generic',
]

describe('action → scene recipe mapping', () => {
  it('resolves every action enum value to a valid { equipment, anim } recipe', () => {
    for (const action of ACTIONS) {
      const r = resolveRecipe(action)
      expect(r, action).toBeTypeOf('object')
      expect(r, action).toBe(SCENE_RECIPES[action])
      expect(EQUIPMENT.has(r.equipment), `${action} equipment=${r.equipment}`).toBe(true)
      // container/handoff are NO LONGER per-action — the sample-follow model owns them
      expect(r).not.toHaveProperty('vessel')
      expect(r).not.toHaveProperty('handoff')
      // anim is the action's behavior descriptor, kept in lockstep with behavior.js
      expect(r.anim).toBe(resolveBehavior(action))
      expect(r.anim).toHaveProperty('fill')
    }
  })

  it('has exactly one entry per vocabulary value and no extras (lockstep)', () => {
    expect(Object.keys(SCENE_RECIPES).sort()).toEqual([...ACTIONS].sort())
  })

  it('falls back to generic for unknown / missing actions', () => {
    expect(resolveRecipe('does_not_exist')).toBe(SCENE_RECIPES.generic)
    expect(resolveRecipe(undefined)).toBe(SCENE_RECIPES.generic)
    expect(resolveRecipe('')).toBe(SCENE_RECIPES.generic)
    expect(resolveRecipe(null)).toBe(SCENE_RECIPES.generic)
  })
})

describe('container axis', () => {
  it('resolves every container to geometry + a removal motion', () => {
    for (const c of CONTAINERS) {
      const r = resolveContainer(c)
      expect(r, c).toBeTypeOf('object')
      expect(typeof r.geo, c).toBe('string')
      expect(['tip', 'aspirate'].includes(r.removal), `${c} removal=${r.removal}`).toBe(true)
    }
  })

  it('tips tubes/columns, aspirates plates/membranes/dishes', () => {
    for (const c of ['microtube', 'tube', 'spin_column', 'eluate_tube', 'cryovial']) {
      expect(resolveRemoval(c), c).toBe('tip')
    }
    for (const c of ['well_plate', 'flask', 'dish', 'membrane', 'slide', 'gel', 'agar_plate']) {
      expect(resolveRemoval(c), c).toBe('aspirate')
    }
  })

  it('unknown/missing container → generic (a tip-out tube)', () => {
    expect(resolveContainer('nope')).toBe(resolveContainer('generic'))
    expect(resolveContainer(undefined)).toBe(resolveContainer('generic'))
    expect(resolveRemoval(null)).toBe('tip')
  })
})

describe('sample-follow container sequence', () => {
  it('seeds microtube, adopts each parsed container, and PERSISTS when unnamed', () => {
    const steps = [
      { action: 'pour_add' },                       // microtube (seed)
      { action: 'transfer', container: 'well_plate' }, // adopts well_plate
      { action: 'incubate_wait' },                  // persists well_plate
      { action: 'electrophorese', container: 'membrane' }, // adopts membrane
      { action: 'stain' },                          // persists membrane
      { action: 'transfer', container: 'tube' },    // back to a tube
    ]
    expect(sampleContainerSequence(steps)).toEqual([
      'microtube', 'well_plate', 'well_plate', 'membrane', 'membrane', 'tube',
    ])
  })

  it('reproduces the RNA tube → column → eluate chain from parsed containers', () => {
    const steps = [
      { action: 'pour_add' },
      { action: 'transfer', container: 'spin_column' },
      { action: 'centrifuge' },
      { action: 'elute', container: 'eluate_tube' },
      { action: 'measure' },
    ]
    expect(sampleContainerSequence(steps)).toEqual([
      'microtube', 'spin_column', 'spin_column', 'eluate_tube', 'eluate_tube',
    ])
  })

  it('ignores an unknown container token (persists previous)', () => {
    const seq = sampleContainerSequence([{ container: 'flask' }, { container: 'bogus' }, {}])
    expect(seq).toEqual(['flask', 'flask', 'flask'])
  })

  it('handles an empty protocol', () => {
    expect(sampleContainerSequence([])).toEqual([])
    expect(sampleContainerSequence()).toEqual([])
  })
})
