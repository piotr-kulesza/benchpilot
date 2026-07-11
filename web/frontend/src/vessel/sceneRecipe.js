// ─────────────────────────────────────────────────────────────────────────
// sceneRecipe.js — pure action → SCENE RECIPE resolver.
//
// `behavior.js` answers "how does the ONE vessel behave?". This module answers
// the richer question the demo (`demos/neutrophil-rna-extraction.html`) poses:
// "what EQUIPMENT and which VESSEL does this action stage, and does the sample
//  change container?". It is the contract the equipment-aware Scene builds on.
//
// Like behavior.js it imports nothing heavy (no three.js / DOM / network), so it
// runs in node under Vitest, and it GUARANTEES every action resolves — unknown /
// missing → the `generic` recipe, so no step ever renders blank or crashes.
//
// It composes behavior.js rather than duplicating it: `anim` IS the action's
// behavior descriptor, so the two modules never drift.
//
// Recipe shape:
//   equipment  which device stages the action. One of:
//              'centrifuge' | 'incubation_block' | 'heat_block' | 'ice_bucket'
//              | 'spin_column' | 'bottle_pipette' | 'reader' | 'bench'
//   vessel     the container the sample sits in for this action. One of:
//              'microtube' | 'spin_column' | 'bottle' | 'eluate_tube'
//   anim       the behavior.js descriptor for this action (fill/pour/spin/…)
//   handoff    true when the sample changes container (transfer / elute)
// ─────────────────────────────────────────────────────────────────────────

import { resolveBehavior } from './behavior.js'

// action → { equipment, vessel, handoff }. The `anim` field is filled in below
// from behavior.js so the two maps stay in lockstep. Mirrors the master-prompt
// table and the demo's per-step equipment (buildCentrifuge, buildColdBlock,
// buildIceBucket, buildSpinColumn, buildNanoDrop, buildBottle). `transfer`,
// `wash` and `elute` all stage a spin column (the master table listed transfer
// as bare bench, but the loading step reads far better on the column it hands off
// to — the incoming microtube pours in beside it).
const RECIPES = {
  pour_add:      { equipment: 'bottle_pipette',   vessel: 'microtube',   handoff: false },
  pipette_mix:   { equipment: 'bottle_pipette',   vessel: 'microtube',   handoff: false },
  vortex_mix:    { equipment: 'bench',            vessel: 'microtube',   handoff: false },
  centrifuge:    { equipment: 'centrifuge',       vessel: 'microtube',   handoff: false },
  incubate_wait: { equipment: 'incubation_block', vessel: 'microtube',   handoff: false },
  heat:          { equipment: 'heat_block',       vessel: 'microtube',   handoff: false },
  cool_ice:      { equipment: 'ice_bucket',       vessel: 'microtube',   handoff: false },
  transfer:      { equipment: 'spin_column',      vessel: 'microtube',   handoff: true  },
  wash:          { equipment: 'spin_column',      vessel: 'spin_column', handoff: false },
  discard:       { equipment: 'bench',            vessel: 'spin_column', handoff: false },
  elute:         { equipment: 'spin_column',      vessel: 'eluate_tube', handoff: true  },
  measure:       { equipment: 'reader',           vessel: 'microtube',   handoff: false },
  generic:       { equipment: 'bench',            vessel: 'microtube',   handoff: false },
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

// The ONE travelling sample's container as each step BEGINS. It starts as a
// microtube and changes ONLY at a hand-off (`transfer` → spin column, `elute` →
// eluate tube); every other action leaves it unchanged. Pure so the invariant is
// unit-testable. `actions` is the ordered list of each step's `action`.
export function sampleContainerSequence(actions = []) {
  const out = []
  let container = 'microtube'
  for (const action of actions) {
    out.push(container)
    if (resolveRecipe(action).handoff) {
      if (action === 'transfer') container = 'spin_column'
      else if (action === 'elute') container = 'eluate_tube'
    }
  }
  return out
}
