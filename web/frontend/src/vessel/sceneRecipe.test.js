import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  SCENE_RECIPES, resolveRecipe, sampleContainerSequence, resolveContainer, resolveRemoval,
  findTransferHandoffDefects, findPrepareOnSampleDefects, findTargetDefects, actsOnSample,
  exitLiftPoint, stepConditions, findInstrumentDefects, NAMED_INSTRUMENTS,
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

// ─── root cause #1: an action may name an instrument only when the step requires one ──
// store / heat / incubate_wait / measure used to name a device from the action alone:
// every store went in the freezer, every heat in the water bath, every incubation in a
// block, every measure on a reader. The rule now: the ACTION + CONTAINER + the step's
// stated CONDITIONS must determine the instrument; otherwise the answer is the bench.
// A missing instrument is acceptable, a guessed one never is (scene-review.md, hard
// constraints 1 and 7).

const ACTION_ALONE_DECIDES_NOTHING = ['store', 'heat', 'incubate_wait', 'measure']
const bench = { tempC: null, roomTemp: false, onIce: false, agitation: false, names: [] }
const cond = (over) => ({ ...bench, ...over })
const equip = (action, container, conditions) => resolveRecipe(action, { container, conditions }).equipment

describe('stepConditions — what a step states, read from its parsed text', () => {
  const c = (text_en) => stepConditions({ text_en })
  it('reads a signed temperature in °C, or null when none is stated', () => {
    expect(c('Return the cells to the 37°C, 5% CO2 incubator.').tempC).toBe(37)
    expect(c('Keep the RNA on ice until measurement, store at −80°C.').tempC).toBe(-80)
    expect(c('transfer into the liquid nitrogen dewar (vapor phase, below -150°C)').tempC).toBe(-150)
    expect(c('Wait 1 min.').tempC).toBe(null)
  })
  it('flags room temperature, ice and agitation', () => {
    expect(c('Incubate 15 min at room temperature.').roomTemp).toBe(true)
    expect(c('Incubate the competent cell/DNA mixture on ice for 20-30 mins.').onIce).toBe(true)
    expect(c('Incubate for 1 hr at room temperature with gentle agitation.').agitation).toBe(true)
    expect(c('Grow in 37°C shaking incubator for 45 min.').agitation).toBe(true)
    expect(c('Incubate for 2 h at room temperature.').agitation).toBe(false)
  })
  it('lists the instruments the text names — and only those', () => {
    expect(c('Grow in 37°C shaking incubator for 45 min.').names).toContain('shaking_incubator')
    expect(c('Grow in 37°C shaking incubator for 45 min.').names).not.toContain('co2_incubator')
    expect(c('Return the cells to the 37°C, 5% CO2 incubator.').names).toContain('co2_incubator')
    expect(c('placing the bottom of the tube into a 42°C water bath for 30-60 secs').names).toContain('water_bath')
    expect(c('The next day, transfer the frozen cryovials into the liquid nitrogen dewar').names).toContain('liquid_nitrogen')
    expect(c('NanoDrop: A260/280 around 2.0').names).toContain('nanodrop')
    expect(c('RNA integrity: Bioanalyzer or TapeStation (RIN).').names).toContain('bioanalyzer')
    expect(c('RNA integrity: Bioanalyzer or TapeStation (RIN).').names).not.toContain('nanodrop')
    expect(c('Record the input cell number and the obtained yield.').names).toEqual([])
    expect(c('Final extension: 72°C for 7 min.').names).toEqual([])
    expect(c('Wait 1 min.').names).toEqual([])
  })
  it('reads the original language when there is no translation', () => {
    expect(stepConditions({ text: 'Inkubować 15 min w temperaturze pokojowej.' }).roomTemp).toBe(true)
  })
})

describe('resolveRecipe — the action alone never names an instrument', () => {
  it.each(ACTION_ALONE_DECIDES_NOTHING)('%s with no container or conditions → bench', (action) => {
    expect(resolveRecipe(action).equipment).toBe('bench')
    expect(equip(action, 'microtube', bench)).toBe('bench')
  })
})

// Finding #1 — store always showed the freezer.
describe('store: the stated temperature and named cabinet decide, else the bench', () => {
  it('37 °C + a named CO₂ incubator, on a culture vessel → the CO₂ incubator (never the freezer)', () => {
    expect(equip('store', 'flask', cond({ tempC: 37, names: ['co2_incubator'] }))).toBe('co2_incubator')
  })
  it('−80 °C on a tube-like vessel → the freezer', () => {
    expect(equip('store', 'cryovial', cond({ tempC: -80, names: ['freezer'] }))).toBe('freezer')
    expect(equip('store', 'eluate_tube', cond({ tempC: -80, onIce: true }))).toBe('freezer')
  })
  it('liquid nitrogen / ≤ −150 °C → the bench: there is no dewar model, and a −80 freezer is a different instrument', () => {
    expect(equip('store', 'cryovial', cond({ tempC: -150, names: ['liquid_nitrogen'] }))).toBe('bench')
    expect(equip('store', 'cryovial', cond({ tempC: -196 }))).toBe('bench')
  })
  it('4 °C, or no temperature at all → the bench (no fridge model; a freezer is not a fridge)', () => {
    expect(equip('store', 'microtube', cond({ tempC: 4 }))).toBe('bench')
    expect(equip('store', 'microtube', bench)).toBe('bench')
  })
})

// Finding #2 — heat always showed the water bath.
describe('heat: only a NAMED water bath earns the bath, and only for a vessel it takes', () => {
  it('a named water bath with a tube → the water bath', () => {
    expect(equip('heat', 'microtube', cond({ tempC: 42, names: ['water_bath'] }))).toBe('water_bath')
  })
  it('a temperature alone does not say bath, block or thermocycler → the bench', () => {
    expect(equip('heat', 'microtube', cond({ tempC: 72 }))).toBe('bench')
    expect(equip('heat', 'microtube', cond({ tempC: 94 }))).toBe('bench')
  })
  it('a slide never goes in a water bath, even if the step names one', () => {
    expect(equip('heat', 'slide', cond({ names: ['flame'] }))).toBe('bench')
    expect(equip('heat', 'slide', cond({ names: ['water_bath'] }))).toBe('bench')
  })
  it('a named but unmodelled heater (microwave, flame) → the bench', () => {
    expect(equip('heat', 'flask', cond({ names: ['microwave'] }))).toBe('bench')
  })
})

// Findings #3 and #4 — incubate_wait always showed a block/shaker/incubator by container.
describe('incubate_wait: conditions decide, and room temperature needs no instrument', () => {
  it('a shaking incubator is not a dry block and not a plate shaker → the bench (no model)', () => {
    expect(equip('incubate_wait', 'microtube', cond({ tempC: 37, agitation: true, names: ['shaking_incubator'] }))).toBe('bench')
    expect(equip('incubate_wait', 'flask', cond({ tempC: 37, agitation: true, names: ['shaking_incubator'] }))).toBe('bench')
  })
  it('room temperature, or a bare wait, needs no instrument → the bench', () => {
    expect(equip('incubate_wait', 'spin_column', cond({ roomTemp: true }))).toBe('bench')
    expect(equip('incubate_wait', 'spin_column', bench)).toBe('bench')
    expect(equip('incubate_wait', 'flask', cond({ roomTemp: true }))).toBe('bench')
    expect(equip('incubate_wait', 'well_plate', cond({ roomTemp: true }))).toBe('bench')
  })
  it('stated agitation on a plate or membrane → the plate shaker', () => {
    expect(equip('incubate_wait', 'membrane', cond({ roomTemp: true, agitation: true }))).toBe('plate_shaker')
    expect(equip('incubate_wait', 'well_plate', cond({ agitation: true, names: ['plate_shaker'] }))).toBe('plate_shaker')
  })
  it('agitation on a vessel the shaker does not take → the bench', () => {
    expect(equip('incubate_wait', 'microtube', cond({ agitation: true }))).toBe('bench')
  })
  it('on ice → the ice bucket, for a vessel it takes', () => {
    expect(equip('incubate_wait', 'microtube', cond({ onIce: true }))).toBe('ice_bucket')
    expect(equip('incubate_wait', 'well_plate', cond({ onIce: true }))).toBe('bench')
  })
  it('a culture vessel at body temperature, or a named CO₂ incubator → the CO₂ incubator', () => {
    expect(equip('incubate_wait', 'flask', cond({ tempC: 37 }))).toBe('co2_incubator')
    expect(equip('incubate_wait', 'dish', cond({ names: ['co2_incubator'] }))).toBe('co2_incubator')
  })
  it('an agar plate at 37 °C needs a bacterial incubator — unmodelled → the bench, never the CO₂ cabinet', () => {
    expect(equip('incubate_wait', 'agar_plate', cond({ tempC: 37 }))).toBe('bench')
  })
  it('a temperature alone on a tube does not say block or bath → the bench', () => {
    expect(equip('incubate_wait', 'microtube', cond({ tempC: 56 }))).toBe('bench')
  })
  it('a named heat block with a tube → the block', () => {
    expect(equip('incubate_wait', 'microtube', cond({ tempC: 56, names: ['heat_block'] }))).toBe('incubation_block')
  })
})

// Finding #4 — measure put every eluate tube on the NanoDrop.
describe('measure: the reading the step names picks the instrument, else the bench', () => {
  it('a named NanoDrop reading on a tube → the NanoDrop', () => {
    expect(equip('measure', 'eluate_tube', cond({ names: ['nanodrop'] }))).toBe('nanodrop')
  })
  it('recording a number is paperwork → the bench', () => {
    expect(equip('measure', 'eluate_tube', bench)).toBe('bench')
  })
  it('a Bioanalyzer/TapeStation is not a NanoDrop → the bench (no model)', () => {
    expect(equip('measure', 'eluate_tube', cond({ names: ['bioanalyzer'] }))).toBe('bench')
  })
  it('each modelled reading goes to its own instrument, and only for a vessel it takes', () => {
    expect(equip('measure', 'well_plate', cond({ names: ['plate_reader'] }))).toBe('plate_reader')
    expect(equip('measure', 'flask', cond({ names: ['microscope'] }))).toBe('inverted_microscope')
    expect(equip('measure', 'slide', cond({ names: ['microscope'] }))).toBe('light_microscope')
    expect(equip('measure', 'slide', cond({ names: ['hemocytometer'] }))).toBe('light_microscope')
    expect(equip('measure', 'gel', cond({ names: ['transilluminator'] }))).toBe('uv_transilluminator')
    expect(equip('measure', 'well_plate', cond({ names: ['nanodrop'] }))).toBe('bench')
    expect(equip('measure', 'eluate_tube', cond({ names: ['plate_reader'] }))).toBe('bench')
  })
})

// End to end over the bundled protocols: every store / heat / incubate_wait / measure
// step, resolved exactly as the runner resolves it (its step text + the sample's carried
// container). Pinned so a finding cannot silently come back.
describe('bundled protocols resolve every instrument-bearing step honestly', () => {
  const dir = fileURLToPath(new URL('../../public/protocols/', import.meta.url))
  const load = (id) => JSON.parse(readFileSync(dir + `${id}.json`, 'utf8'))
  const resolveAt = (id, index) => {
    const steps = load(id).steps
    const i = steps.findIndex((s) => s.index === index)
    const s = steps[i]
    return resolveRecipe(s.action, { container: sampleContainerSequence(steps)[i], conditions: stepConditions(s) }).equipment
  }
  it.each([
    // finding #1 — store
    ['passaging', 14, 'co2_incubator'],   // return the cells to the 37 °C, 5 % CO₂ incubator
    ['cryopreservation', 6, 'freezer'],   // −80 °C freezer overnight
    ['cryopreservation', 7, 'bench'],     // liquid nitrogen dewar — unmodelled
    ['neutrophil_rna', 25, 'freezer'],    // store at −80 °C
    ['pcr', 7, 'bench'],                  // hold at 4 °C
    // finding #2 — heat
    ['transformation', 5, 'water_bath'],  // 42 °C water bath, named
    ['pcr', 4, 'bench'],                  // initial denaturation 94 °C — no instrument named
    ['pcr', 6, 'bench'],                  // final extension 72 °C — no instrument named
    ['agarose_gel', 2, 'bench'],          // microwave — unmodelled
    ['gram_stain', 2, 'bench'],           // heat-fix the slide in a flame — unmodelled
    // finding #3 — incubate at 37 °C
    ['transformation', 8, 'bench'],       // 37 °C shaking incubator — unmodelled
    ['transformation', 10, 'bench'],      // plates at 37 °C overnight — bacterial incubator unmodelled
    // finding #4 — incubate with no instrument
    ['neutrophil_rna', 13, 'bench'],      // 15 min at room temperature
    ['neutrophil_rna', 23, 'bench'],      // wait 1 min
    ['passaging', 6, 'bench'],            // room temperature, ~2 min (was the CO₂ incubator)
    ['elisa', 17, 'bench'],               // 2 h at room temperature, no agitation
    ['transformation', 4, 'ice_bucket'],  // on ice
    ['western', 7, 'plate_shaker'],       // gentle agitation, membrane
    ['elisa', 10, 'plate_shaker'],        // gentle agitation, plate
    // finding #4 — measure
    ['neutrophil_rna', 26, 'nanodrop'],   // NanoDrop A260/280
    ['neutrophil_rna', 27, 'bench'],      // Bioanalyzer / TapeStation — unmodelled
    ['neutrophil_rna', 28, 'bench'],      // record the yield — paperwork
    ['passaging', 1, 'inverted_microscope'], // monitor viability of the adherent culture
    ['elisa', 27, 'plate_reader'],        // absorbance in the plate reader
    ['agarose_gel', 12, 'uv_transilluminator'],
    ['gram_stain', 15, 'light_microscope'],
  ])('%s step %i → %s', (id, index, expected) => {
    expect(resolveAt(id, index)).toBe(expected)
  })
})

// The same rules as an offline invariant (scripts/schema-audit.mjs): every instrument a
// step resolves to must be one its stated conditions require and its container fits.
describe('findInstrumentDefects — the instrument rule as an audit', () => {
  it('flags an instrument the step does not require, one that rejects the container, and a room-temperature step in a temperature-controlled device', () => {
    const resolve = () => 'freezer' // a regressed resolver: the action alone decides
    const steps = [
      { index: 1, action: 'store', container: 'flask', text_en: 'Return the cells to the incubator.' },
      { index: 2, action: 'store', container: 'microtube', text_en: 'Keep at room temperature.' },
    ]
    const d = findInstrumentDefects(steps, resolve)
    expect(d.map((x) => [x.index, x.why])).toEqual([
      [1, 'not-required'], [1, 'rejects-container'],
      [2, 'not-required'], [2, 'contradicts-room-temp'],
    ])
  })
  it('flags a device standing in for a named unmodelled one', () => {
    const d = findInstrumentDefects(
      [{ index: 3, action: 'incubate_wait', container: 'flask', text_en: 'Grow in 37°C shaking incubator.' }],
      () => 'co2_incubator',
    )
    expect(d.map((x) => x.why)).toContain('stands-in-for-unmodelled')
  })
  it('accepts the bench, always', () => {
    expect(findInstrumentDefects([{ index: 1, action: 'measure', container: 'eluate_tube', text_en: 'Record the yield.' }])).toEqual([])
  })
})

describe('bundled protocols name only the instruments their steps require', () => {
  const dir = fileURLToPath(new URL('../../public/protocols/', import.meta.url))
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
  it.each(files)('%s has no guessed instrument', (file) => {
    const proto = JSON.parse(readFileSync(dir + file, 'utf8'))
    const defects = findInstrumentDefects(proto.steps || [])
    expect(defects, `${file}: ${JSON.stringify(defects)}`).toEqual([])
  })
})

// When the schema grows structured conditions (step.conditions), they are the source of
// truth and the text regex is only the fallback, PER FIELD. The change must be a no-op
// for the player: structured values equal to what the text says resolve identically.
describe('stepConditions prefers structured step.conditions, falls back to text per field', () => {
  const text_en = 'Incubate 15 min at room temperature.'
  it('a structured field wins over what the text says', () => {
    const c = stepConditions({ text_en, conditions: { temperature_c: 37, room_temperature: false, on_ice: true, agitation: true, instruments: ['co2_incubator'] } })
    expect(c).toEqual({ tempC: 37, roomTemp: false, onIce: true, agitation: true, names: ['co2_incubator'] })
  })
  it('a structured false / empty list is a statement, not an absence', () => {
    const c = stepConditions({ text_en: 'Grow in 37°C shaking incubator.', conditions: { agitation: false, instruments: [] } })
    expect(c.agitation).toBe(false)
    expect(c.names).toEqual([])
    expect(c.tempC).toBe(37) // not given structurally → read from the text
  })
  it('absent or null fields fall back to the text', () => {
    expect(stepConditions({ text_en, conditions: { temperature_c: null } })).toEqual(stepConditions({ text_en }))
    expect(stepConditions({ text_en, conditions: {} })).toEqual(stepConditions({ text_en }))
  })
  it('is a no-op for every bundled step when the structured values match the text', () => {
    const dir = fileURLToPath(new URL('../../public/protocols/', import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
    for (const f of files) {
      const steps = JSON.parse(readFileSync(dir + f, 'utf8')).steps
      const seq = sampleContainerSequence(steps)
      steps.forEach((s, i) => {
        const fromText = stepConditions(s)
        const structured = { ...s, conditions: {
          temperature_c: fromText.tempC, room_temperature: fromText.roomTemp, on_ice: fromText.onIce,
          agitation: fromText.agitation, instruments: fromText.names,
        } }
        expect(stepConditions(structured), `${f} step ${s.index}`).toEqual(fromText)
        const r = (st) => resolveRecipe(st.action, { container: seq[i], conditions: stepConditions(st) }).equipment
        expect(r(structured), `${f} step ${s.index}`).toBe(r(s))
      })
    }
  })
})

// The parser fills step.conditions.instruments from core/schema.py INSTRUMENTS; the
// text fallback recognises NAMED_INSTRUMENTS. One vocabulary, two languages — drift
// would make a parsed id the resolver never checks, or a regex id the parser never emits.
describe('instrument vocabulary lockstep with the parser schema', () => {
  it('core/schema.py INSTRUMENTS equals NAMED_INSTRUMENTS', () => {
    const py = readFileSync(fileURLToPath(new URL('../../../../core/schema.py', import.meta.url)), 'utf8')
    const block = py.match(/^INSTRUMENTS = \(([\s\S]*?)^\)/m)
    expect(block, 'INSTRUMENTS tuple not found in core/schema.py').toBeTruthy()
    const ids = [...block[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1])
    expect([...ids].sort()).toEqual([...NAMED_INSTRUMENTS].sort())
  })
})
