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
  { id: 'microtube',    kind: 'container', span: 2.4, orient: 'stands upright', build: () => demo.buildTube({ color: demo.COL.pellet, label: 'microtube' }) },
  { id: 'spin_column',  kind: 'container', span: 2.4, orient: 'stands upright (column in a collection tube)', build: () => demo.buildSpinColumn() },
  { id: 'eluate_tube',  kind: 'container', span: 1.8, orient: 'stands upright', build: () => demo.buildTube({ color: demo.COL.rna, label: 'eluate' }) },
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
  { id: 'inverted_microscope', kind: 'equipment', span: 3.4, orient: 'inverted scope: open stage, objective UNDER it, lamp arch OVER (flask)', build: () => demo.buildInvertedMicroscope() },
  { id: 'light_microscope',    kind: 'equipment', span: 2.8, orient: 'upright scope: slide on stage, objectives above, 100× oil', build: () => demo.buildLightMicroscope() },
  { id: 'uv_transilluminator', kind: 'equipment', span: 3.2, orient: 'UV light box: glowing surface, amber hood, gel-doc camera (gel)', build: () => demo.buildUVTransilluminator() },
  { id: 'bottle',        kind: 'equipment', span: 2.0, orient: 'reagent bottle with a cap', build: () => demo.buildBottle(demo.COL.wash, 'RPE', 1.3, demo.COL.wash) },
  { id: 'pipette',       kind: 'equipment', span: 2.6, orient: 'air-displacement micropipette', build: () => demo.buildPipette() },
  { id: 'pipette_stand', kind: 'equipment', span: 3.2, orient: 'pipette carousel/stand', build: () => demo.buildPipetteStand() },
  { id: 'tube_stand',    kind: 'equipment', span: 1.2, orient: 'open microtube stand: bored deck on two end legs, open floor — a tube stands in it tip-on-bench', build: () => demo.buildTubeStand() },
  { id: 'pcr_tube_stand', kind: 'equipment', span: 0.8, orient: 'open 0.2 mL PCR tube stand: bored deck on two end legs, open floor', build: () => demo.buildTubeStand('pcr_tube_stand') },
  { id: 'cool_rack',     kind: 'equipment', span: 2.4, orient: 'chilled aluminium tube rack lying along x: 4 × 0.2 mL seats (left), 8 × 1.5 mL seats (right), real bores', build: () => demo.buildCoolRack() },
  { id: 'ice_pan',       kind: 'equipment', span: 2.8, orient: 'shallow white ice pan, crushed ice packed round an empty rack bed', build: () => demo.buildIcePan() },
  { id: 'ice_bucket',    kind: 'equipment', span: 2.4, orient: 'ice bucket', build: () => demo.buildIceBucket() },
  { id: 'waste',         kind: 'equipment', span: 1.8, orient: 'waste beaker/container', build: () => demo.buildWaste() },
  { id: 'syringe',       kind: 'equipment', span: 2.9, orient: 'syringe with needle', build: () => demo.buildSyringe() },
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
  // (no single-container transfer cells: a transfer needs a SOURCE vessel to show its
  //  action — those are MATRIX_TRANSITIONS below; a lone vessel at rest proves nothing)
  { action: 'discard',        containers: ['microtube', 'well_plate', 'membrane'] },
  { action: 'elute',          containers: ['eluate_tube'] },
  { action: 'measure',        containers: ['microtube', 'well_plate', 'flask', 'slide', 'gel'] },
  { action: 'thermocycle',    containers: ['microtube'] },
  { action: 'electrophorese', containers: ['gel', 'membrane'] },
  { action: 'store',          containers: ['cryovial', 'microtube', 'flask'] },
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
  ['microtube', 'gel'],   // loading gel wells from a tube — pipetted (the gel exception)
]

// store / heat / incubate_wait / measure take their instrument from what the step
// STATES (sceneRecipe.resolveRecipe), not from the action — so a cell with no text
// would render the bench and prove nothing. Each such cell carries a representative
// step text (verbatim from a bundled protocol where one exists) and the instrument
// that text must resolve to (`expect`), pinned by src/dev/registry.test.js.
// ?matrix=1&text=… overrides the cell's text.
export const MATRIX_TEXT = {
  'incubate_wait:microtube':  { expect: 'incubation_block', text: 'Incubate at 56 °C for 10 min in a heat block.' },
  'incubate_wait:well_plate': { expect: 'plate_shaker', text: 'Block with gentle agitation for 1-2 h at room temperature.' },       // elisa 10
  'incubate_wait:membrane':   { expect: 'plate_shaker', text: 'Incubate for 1 hr at room temperature with gentle agitation.' },    // western 7
  'incubate_wait:slide':      { expect: 'bench', text: 'Let the crystal violet stand for 1 min.' },                               // gram_stain 4
  'incubate_wait:flask':      { expect: 'co2_incubator', text: 'Incubate the flask at 37 °C for 5 min to detach the cells.' },
  'heat:microtube':           { expect: 'water_bath', text: 'Heat shock each transformation tube by placing the bottom 1/2 to 2/3 of the tube into a 42°C water bath for 30-60 secs.' }, // transformation 5
  'heat:slide':               { expect: 'bench', text: 'Heat-fix the smear by passing the slide through a flame two or three times.' }, // gram_stain 2
  'measure:microtube':        { expect: 'nanodrop', text: 'NanoDrop: A260/280 around 2.0; A260/230 in the range 2.0–2.2.' },     // neutrophil_rna 26
  'measure:well_plate':       { expect: 'plate_reader', text: 'Read the absorbance in the plate reader at 450 nm.' },              // elisa 27
  'measure:flask':            { expect: 'inverted_microscope', text: 'Observe the cells under the microscope for detachment.' },   // passaging 7
  'measure:slide':            { expect: 'light_microscope', text: 'Examine the slide under the light microscope using the oil immersion (100x) objective.' }, // gram_stain 15
  'measure:gel':              { expect: 'uv_transilluminator', text: 'Place the gel on the transilluminator to visualize and photograph the DNA bands under UV light.' }, // agarose_gel 12
  'store:cryovial':           { expect: 'freezer', text: 'Place the cryovials into an isopropanol freezing container and transfer to a -80°C freezer overnight.' }, // cryopreservation 6
  'store:microtube':          { expect: 'freezer', text: 'Keep the RNA on ice until measurement, store at −80°C.' },              // neutrophil_rna 25
  'store:flask':              { expect: 'co2_incubator', text: 'Return the cells to the 37°C, 5% CO2 incubator.' },               // passaging 14
}

// The representative text for a cell ('' when its action needs none).
export function matrixText(action, container) {
  return MATRIX_TEXT[`${action}:${container}`]?.text || ''
}

// Flat list of matrix cells for the harness to enumerate.
export const MATRIX_CELLS = MATRIX_ACTIONS.flatMap((a) => a.containers.map((c) => ({ action: a.action, container: c, text: matrixText(a.action, c) })))
