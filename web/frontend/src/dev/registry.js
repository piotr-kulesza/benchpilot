// Dev-only registry: every MODEL the scene can mount, built in isolation, plus the
// (action × container) animation MATRIX. Used by the ?models=1 gallery and the
// ?matrix=1 animation harness. Pure data + builder thunks — no React, no DOM here.
import * as demo from '../scene/demoScene.js'

// Each model: how to build it, its kind, and a `span` hint (world extent) so the
// gallery can frame wide-and-low objects (a T-flask) differently from tall-thin
// ones (a tube). `orient` is a short human note of the CORRECT resting pose, shown
// as a caption so the auditor can compare intent vs. render.
export const MODELS = [
  // ── containers ──────────────────────────────────────────────────────────
  { id: 'microtube',    kind: 'container', span: 2.4, orient: 'stands upright', build: () => demo.buildTube({ height: 1.7, radius: 0.32, color: demo.COL.pellet, label: 'microtube' }) },
  { id: 'spin_column',  kind: 'container', span: 2.4, orient: 'stands upright (column in a collection tube)', build: () => demo.buildSpinColumn() },
  { id: 'eluate_tube',  kind: 'container', span: 1.8, orient: 'stands upright', build: () => demo.buildTube({ height: 1.15, radius: 0.26, color: demo.COL.rna, label: 'eluate' }) },
  { id: 'cryovial',     kind: 'container', span: 1.6, orient: 'stands upright, skirted base', build: () => demo.buildCryovial() },
  { id: 'well_plate',   kind: 'container', span: 2.6, orient: 'lies flat, 8×12 wells', build: () => demo.buildWellPlate() },
  { id: 'flask',        kind: 'container', span: 2.6, orient: 'T-flask LIES FLAT on its side, canted neck at a top corner', build: () => demo.buildFlask() },
  { id: 'dish',         kind: 'container', span: 2.2, orient: 'petri dish lies flat, base + larger lid', build: () => demo.buildDish() },
  { id: 'slide',        kind: 'container', span: 2.4, orient: 'glass slide lies flat, ~3:1, frosted label end', build: () => demo.buildSlide() },
  { id: 'membrane',     kind: 'container', span: 2.0, orient: 'thin flat sheet, matte', build: () => demo.buildMembrane() },
  { id: 'gel',          kind: 'container', span: 2.2, orient: 'agarose slab in a tray, wells along one edge', build: () => demo.buildGelSlab() },
  { id: 'agar_plate',   kind: 'container', span: 2.2, orient: 'petri dish with an agar bed', build: () => demo.buildAgarPlate() },
  // ── equipment ───────────────────────────────────────────────────────────
  { id: 'centrifuge',    kind: 'equipment', span: 3.2, orient: 'benchtop centrifuge, lid + rotor', build: () => demo.buildCentrifuge() },
  { id: 'cold_block',    kind: 'equipment', span: 3.0, orient: 'dry heat/cool block, well array', build: () => demo.buildColdBlock() },
  { id: 'water_bath',    kind: 'equipment', span: 3.2, orient: 'open stainless basin of water + temp dial', build: () => demo.buildWaterBath() },
  { id: 'thermocycler',  kind: 'equipment', span: 3.2, orient: 'heated block, well array under a lid, panel', build: () => demo.buildThermocycler() },
  { id: 'gel_rig',       kind: 'equipment', span: 3.4, orient: 'buffer tank + lid + power box with display', build: () => demo.buildGelRig() },
  { id: 'freezer',       kind: 'equipment', span: 3.2, orient: 'box with a door that opens', build: () => demo.buildFreezer() },
  { id: 'staining_tray',  kind: 'equipment', span: 3.0, orient: 'shallow tray with rails for slides', build: () => demo.buildStainingTray() },
  { id: 'spreader',      kind: 'equipment', span: 1.6, orient: 'bent-glass cell spreader (hockey stick)', build: () => demo.buildSpreader() },
  { id: 'nanodrop',      kind: 'equipment', span: 2.8, orient: 'micro-volume spectrophotometer (tubes only)', build: () => demo.buildNanoDrop() },
  { id: 'plate_reader',  kind: 'equipment', span: 3.4, orient: 'ELISA absorbance reader with a plate drawer', build: () => demo.buildPlateReader() },
  { id: 'plate_shaker',  kind: 'equipment', span: 3.2, orient: 'orbital plate shaker/incubator', build: () => demo.buildPlateShaker() },
  { id: 'co2_incubator', kind: 'equipment', span: 3.6, orient: 'warm CO₂ incubator, glass door + shelves (for flasks)', build: () => demo.buildCO2Incubator() },
  { id: 'bottle',        kind: 'equipment', span: 2.0, orient: 'reagent bottle with a cap', build: () => demo.buildBottle(demo.COL.wash, 'RPE', 1.3, demo.COL.wash) },
  { id: 'pipette',       kind: 'equipment', span: 2.6, orient: 'air-displacement micropipette', build: () => demo.buildPipette() },
  { id: 'pipette_stand', kind: 'equipment', span: 3.2, orient: 'pipette carousel/stand', build: () => demo.buildPipetteStand() },
  { id: 'ice_bucket',    kind: 'equipment', span: 2.4, orient: 'ice bucket', build: () => demo.buildIceBucket() },
  { id: 'waste',         kind: 'equipment', span: 1.8, orient: 'waste beaker/container', build: () => demo.buildWaste() },
  { id: 'syringe',       kind: 'equipment', span: 2.2, orient: 'syringe with needle', build: () => demo.buildSyringe() },
]

export const MODEL_IDS = MODELS.map((m) => m.id)
export function getModel(id) { return MODELS.find((m) => m.id === id) }

// ── animation matrix (Phase 3) ──────────────────────────────────────────────
// The (action, container) pairs that plausibly occur, plus the container
// TRANSITIONS seen across the 9 example protocols. Nonsense pairs are omitted.
export const MATRIX_ACTIONS = [
  { action: 'pour_add',       containers: ['microtube', 'well_plate', 'flask', 'dish', 'slide', 'membrane', 'spin_column'] },
  { action: 'pipette_mix',    containers: ['microtube', 'well_plate'] },
  { action: 'vortex_mix',     containers: ['microtube'] },
  { action: 'homogenize',     containers: ['microtube'] },
  { action: 'centrifuge',     containers: ['microtube', 'spin_column'] },
  { action: 'incubate_wait',  containers: ['microtube', 'well_plate', 'membrane', 'slide', 'flask'] },
  { action: 'heat',           containers: ['microtube', 'slide'] },
  { action: 'cool_ice',       containers: ['microtube'] },
  { action: 'transfer',       containers: ['spin_column', 'eluate_tube', 'cryovial'] },
  { action: 'discard',        containers: ['microtube', 'well_plate', 'membrane'] },
  { action: 'elute',          containers: ['eluate_tube'] },
  { action: 'measure',        containers: ['microtube', 'well_plate'] },
  { action: 'thermocycle',    containers: ['microtube'] },
  { action: 'electrophorese', containers: ['gel', 'membrane'] },
  { action: 'store',          containers: ['cryovial', 'microtube'] },
  { action: 'seed',           containers: ['flask', 'dish', 'agar_plate', 'well_plate'] },
  { action: 'stain',          containers: ['slide', 'gel'] },
]

// Container transitions to exercise explicitly (from → to), harvested from the
// example protocols (ELISA tube→plate, Western gel→membrane, cryo flask→tube→vial…).
export const MATRIX_TRANSITIONS = [
  ['microtube', 'well_plate'], ['well_plate', 'microtube'],
  ['microtube', 'spin_column'], ['spin_column', 'eluate_tube'],
  ['gel', 'membrane'], ['flask', 'microtube'], ['microtube', 'cryovial'],
  ['microtube', 'flask'], ['microtube', 'slide'],
]

// Flat list of matrix cells for the harness to enumerate.
export const MATRIX_CELLS = MATRIX_ACTIONS.flatMap((a) => a.containers.map((c) => ({ action: a.action, container: c })))
