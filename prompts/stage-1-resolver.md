# Stage 1 — pure `action → scene recipe` resolver (+ tests)

**First, read `prompts/master-3d-scene-generator.md` and open
`demos/neutrophil-rna-extraction.html` — that demo is the visual spec.**
This stage writes NO three.js. It only locks the contract everything else builds on.

## Scope
Add a pure resolver that turns a `Step.action` (the fixed 13-value `ACTIONS`
vocab in `core/schema.py`) into a plain **scene recipe** descriptor. Model it on
the existing `web/frontend/src/vessel/behavior.js` (same spirit: no heavy imports,
unit-testable in node, unknown → `generic`).

## Deliverable
`web/frontend/src/vessel/sceneRecipe.js` exporting `resolveRecipe(action)` →
```
{
  equipment: 'centrifuge' | 'incubation_block' | 'heat_block' | 'ice_bucket'
           | 'spin_column' | 'bottle_pipette' | 'reader' | 'bench',
  vessel:    'microtube' | 'spin_column' | 'bottle' | 'eluate_tube',
  anim:      { ...existing behavior fields: fill, pour, pipette, spin, swirl,
               shake, bubbles, warm, frost, pulse, ring, transfer, drop, tip,
               flowThrough, gauge },
  handoff:   boolean   // true for transfer/elute (sample changes container)
}
```
Cover EVERY value in `ACTIONS` per the table in the master prompt; unknown/missing
→ the `generic` recipe. Keep `behavior.js` intact (reuse/compose its descriptors).

## Done when
- `npm test` (Vitest, offline) passes.
- A test asserts every `ACTIONS` value resolves to a valid recipe, and an unknown
  string → `generic`.
- No three.js / DOM / network import in this module.

Commit: `feat(web): pure action→scene-recipe resolver + tests`.
