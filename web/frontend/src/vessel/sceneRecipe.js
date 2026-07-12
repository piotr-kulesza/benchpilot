// ─────────────────────────────────────────────────────────────────────────
// sceneRecipe.js — pure resolvers for the equipment-aware Scene.
//
// TWO DECOUPLED AXES (this is the Stage-6 generalization):
//   • ACTION → EQUIPMENT + anim.  What the step DOES (a centrifuge spins, a plate
//     reader reads). `resolveRecipe(action)` answers this. `anim` IS the behavior.js
//     descriptor so the two modules never drift.
//   • CONTAINER → geometry + removal motion.  WHERE the sample sits (microtube,
//     well plate, membrane, …). This now comes from the sample-follow sequence
//     (`sampleContainerSequence`, seeded + persisted from each step's parsed
//     `container`), NOT from a per-action `vessel`/`handoff`. A "transfer" is simply
//     a step whose container differs from the previous one.
//
// Imports nothing heavy (no three.js / DOM / network) so it runs in node under
// Vitest. GUARANTEES every action AND every container resolves — unknown/missing →
// `generic` (action) / persist (container) — so no step ever renders blank.
// ─────────────────────────────────────────────────────────────────────────

import { resolveBehavior } from './behavior.js'

// action → { equipment }. `anim` is filled in from behavior.js below.
// equipment is the STATION device; the sample's vessel is the container axis.
const RECIPES = {
  pour_add:       { equipment: 'bottle_pipette' },
  pipette_mix:    { equipment: 'bottle_pipette' },
  vortex_mix:     { equipment: 'bench' },
  homogenize:     { equipment: 'syringe' },
  centrifuge:     { equipment: 'centrifuge' },
  incubate_wait:  { equipment: 'incubation_block' },
  heat:           { equipment: 'heat_block' },
  cool_ice:       { equipment: 'ice_bucket' },
  transfer:       { equipment: 'bench' },        // no baked destination — container decides
  discard:        { equipment: 'bench' },
  elute:          { equipment: 'centrifuge' },    // the elution spin
  measure:        { equipment: 'reader' },
  thermocycle:    { equipment: 'thermocycler' },
  electrophorese: { equipment: 'gel_rig' },
  store:          { equipment: 'freezer' },
  seed:           { equipment: 'bench' },          // container = flask/dish/agar_plate
  stain:          { equipment: 'staining_tray' },
  generic:        { equipment: 'bench' },
}

// The full recipe map, each entry carrying its behavior descriptor as `anim`.
export const SCENE_RECIPES = Object.fromEntries(
  Object.entries(RECIPES).map(([action, r]) => [
    action,
    { ...r, anim: resolveBehavior(action) },
  ]),
)

// Resolve an action to its scene recipe; unknown / missing → generic.
export function resolveRecipe(action) {
  return SCENE_RECIPES[action] || SCENE_RECIPES.generic
}

// ─── container axis ──────────────────────────────────────────────────────
// container → { geo (geometry key the Scene mounts), removal (how liquid leaves) }.
//   removal 'tip'      — the vessel tilts and dumps (a tube you can pick up)
//   removal 'aspirate' — a pipette sucks it out (NEVER tip a plate/dish/membrane)
// The `geo` key maps to a demoScene builder / sample-vessel slot in the Scene.
const CONTAINERS = {
  microtube:   { geo: 'tube',     removal: 'tip' },
  tube:        { geo: 'tube',     removal: 'tip' },
  spin_column: { geo: 'column',   removal: 'tip' },
  eluate_tube: { geo: 'elu',      removal: 'tip' },
  cryovial:    { geo: 'cryovial', removal: 'tip' },
  bottle:      { geo: 'tube',     removal: 'tip' },
  well_plate:  { geo: 'wellplate', removal: 'aspirate' },
  flask:       { geo: 'flask',    removal: 'aspirate' },
  dish:        { geo: 'dish',     removal: 'aspirate' },
  membrane:    { geo: 'membrane', removal: 'aspirate' },
  slide:       { geo: 'slide',    removal: 'aspirate' },
  gel:         { geo: 'gel',      removal: 'aspirate' },
  agar_plate:  { geo: 'agarplate', removal: 'aspirate' },
  generic:     { geo: 'tube',     removal: 'tip' },
}

// Resolve a container token → { geo, removal }; unknown/missing → generic (a tube).
export function resolveContainer(container) {
  return CONTAINERS[container] || CONTAINERS.generic
}

// How liquid is removed from the CURRENT container: 'tip' vs 'aspirate'.
export function resolveRemoval(container) {
  return resolveContainer(container).removal
}

// The ONE travelling sample's container as each step BEGINS — the SAMPLE-FOLLOW
// model. Seed with the first named container (or microtube), then for each step
// use its parsed `container` if present, else CARRY the previous one. Pure so the
// invariant is unit-testable. `steps` is the ordered list of step objects.
export function sampleContainerSequence(steps = []) {
  const out = []
  let container = 'microtube'
  for (const s of steps) {
    const named = s && typeof s === 'object' ? s.container : null
    if (named && CONTAINERS[named]) container = named
    out.push(container)
  }
  return out
}

// A `transfer` is the ONE action that, by definition, moves the sample into a NEW
// vessel — so it MUST name that destination in its own `container`. When it doesn't,
// the container simply CARRIES forward from the previous step: the sample-follow sees
// no change, the hand-off never fires, and the tube quietly fills. That is the DATA
// DEFECT the `transfer → spin_column` hardcode masked for weeks (the "load column"
// regression). Surface every transfer that fails to name its own destination — never
// silently tolerate it. A transfer that explicitly names a vessel (even the same TYPE,
// e.g. aliquoting a tube into fresh tubes) is fine: the destination WAS declared.
export function findTransferHandoffDefects(steps = []) {
  const seq = sampleContainerSequence(steps)
  const out = []
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (!s || typeof s !== 'object' || s.action !== 'transfer') continue
    const named = s.container && CONTAINERS[s.container]
    if (!named) out.push({ index: s.index != null ? s.index : i, container: seq[i] })
  }
  return out
}
