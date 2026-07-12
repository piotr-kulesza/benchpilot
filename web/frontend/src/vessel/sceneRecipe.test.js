import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  SCENE_RECIPES, resolveRecipe, sampleContainerSequence, resolveContainer, resolveRemoval,
  findTransferHandoffDefects, findPrepareOnSampleDefects, findTargetDefects, actsOnSample,
  exitLiftPoint,
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

describe('transfer hand-off defect guard', () => {
  it('flags a transfer whose container carried forward unchanged (no destination)', () => {
    // step 2 is a transfer but names no container → it stays microtube like step 1
    const steps = [
      { index: 1, action: 'pour_add' },
      { index: 2, action: 'transfer' }, // DEFECT: no destination, carries microtube
    ]
    expect(findTransferHandoffDefects(steps)).toEqual([{ index: 2, container: 'microtube' }])
  })

  it('accepts a transfer that names a distinct destination', () => {
    const steps = [
      { index: 1, action: 'pour_add' },
      { index: 2, action: 'transfer', container: 'spin_column' },
    ]
    expect(findTransferHandoffDefects(steps)).toEqual([])
  })

  it('accepts a transfer that names the same vessel TYPE (aliquot tube→tubes)', () => {
    const steps = [
      { index: 1, action: 'pour_add', container: 'tube' },
      { index: 2, action: 'transfer', container: 'tube' }, // destination WAS declared
    ]
    expect(findTransferHandoffDefects(steps)).toEqual([])
  })

  it('does not flag elute/seed that reuse a vessel type (out of scope)', () => {
    const steps = [
      { index: 1, action: 'seed', container: 'flask' },
      { index: 2, action: 'seed', container: 'flask' }, // legit: reseed new flasks
    ]
    expect(findTransferHandoffDefects(steps)).toEqual([])
  })
})

// COVERAGE ASSERTION (Stage 12): the same guard the renderer warns with, run over
// EVERY bundled protocol. A hardcoded transfer→spin_column special-case masked a
// missing destination container for weeks; this makes the invariant non-negotiable.
describe('bundled protocols name every transfer destination', () => {
  const dir = fileURLToPath(new URL('../../public/protocols/', import.meta.url))
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')

  it.each(files)('%s has no carried-forward transfer (hand-off always fires)', (file) => {
    const proto = JSON.parse(readFileSync(dir + file, 'utf8'))
    const defects = findTransferHandoffDefects(proto.steps || [])
    expect(defects, `${file}: ${JSON.stringify(defects)}`).toEqual([])
  })
})

// Stage 34: leaving a docked instrument, the sample lifts STRAIGHT UP before it glides —
// it never teleports and never drags through the rotor/lid.
describe('exit lift-out geometry (no teleport)', () => {
  it('rises straight up (same x/z, raised y) to the clearance height', () => {
    const from = { x: 6.4, y: 0.32, z: 0.03 }
    const lift = exitLiftPoint(from, 2.15)
    expect(lift.x).toBe(from.x)
    expect(lift.z).toBe(from.z)
    expect(lift.y).toBe(2.15)
  })
  it('keeps a sample already above the clearance height where it is (never drops it)', () => {
    const lift = exitLiftPoint({ x: 1, y: 3.0, z: 0 }, 2.15)
    expect(lift.y).toBe(3.0)
  })
  it('the two-segment exit path is continuous — no step jumps the whole distance', () => {
    // lift-out then glide: current -> lift -> seat. Each leg is a bounded move; the path
    // never contains a single hop across the full transition (that would be a teleport).
    const from = { x: 6.4, y: 0.32, z: 0.03 }
    const seat = { x: 8.0, y: 0.30, z: 0.03 }
    const lift = exitLiftPoint(from, 2.15)
    const legUp = Math.hypot(lift.x - from.x, lift.y - from.y, lift.z - from.z)
    const legOver = Math.hypot(seat.x - lift.x, seat.y - lift.y, seat.z - lift.z)
    const direct = Math.hypot(seat.x - from.x, seat.y - from.y, seat.z - from.z)
    // going up-and-over is a real path (longer than the diagonal shortcut through the lid)
    expect(legUp + legOver).toBeGreaterThan(direct)
    // and the first leg is purely vertical — it does not cut across toward the next station
    expect(lift.x - from.x).toBe(0)
  })
})

// Stage 34: which vessel a step acts on. A `prepare` acts on its own product (never the
// sample); every other step — including one that DRAWS FROM a mix — acts on the sample.
describe('a step says which vessel it acts on', () => {
  it('actsOnSample: prepare acts on its product; a consumer still acts on the sample', () => {
    expect(actsOnSample({ action: 'prepare', target: 'dnase_mix' })).toBe(false)
    expect(actsOnSample({ action: 'pour_add', target: 'sample', draws_from: 'dnase_mix' })).toBe(true)
    expect(actsOnSample({ action: 'centrifuge' })).toBe(true) // missing target defaults to sample
  })
  it('findTargetDefects flags a prepare aimed at the sample and a non-prepare aimed at a prep vessel', () => {
    const clean = [
      { index: 1, action: 'prepare', target: 'dnase_mix' },
      { index: 2, action: 'pour_add', target: 'sample', draws_from: 'dnase_mix' },
      { index: 3, action: 'centrifuge', target: 'sample' },
    ]
    expect(findTargetDefects(clean)).toEqual([])
    const dirty = [
      { index: 1, action: 'prepare', target: 'sample' },   // a prep must not target the sample
      { index: 2, action: 'pour_add', target: 'dnase_mix' }, // a normal step must target the sample
    ]
    expect(findTargetDefects(dirty).map((d) => d.index)).toEqual([1, 2])
  })
})

// COVERAGE ASSERTION (Stage 33): a side preparation happens in ITS OWN vessel — it must
// never name the sample's current vessel as its destination, or the renderer would pour
// the mix INTO the sample (the "DNase into the column" lie). Not every step happens to
// the sample.
describe('bundled protocols keep side preparations off the sample', () => {
  const dir = fileURLToPath(new URL('../../public/protocols/', import.meta.url))
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')

  it.each(files)('%s has no prepare step targeting the sample vessel', (file) => {
    const proto = JSON.parse(readFileSync(dir + file, 'utf8'))
    const defects = findPrepareOnSampleDefects(proto.steps || [])
    expect(defects, `${file}: ${JSON.stringify(defects)}`).toEqual([])
  })

  it.each(files)('%s: every step says which vessel it acts on', (file) => {
    const proto = JSON.parse(readFileSync(dir + file, 'utf8'))
    const defects = findTargetDefects(proto.steps || [])
    expect(defects, `${file}: ${JSON.stringify(defects)}`).toEqual([])
  })
})
