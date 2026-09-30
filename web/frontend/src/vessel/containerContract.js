import { dims, clearance } from '../scene/dims.js'
// Phase 2 — THE CONTRACT. Each container declares its own geometry facts, so the
// microtube stops being the implicit default that everything else deviates from.
// The pipette asks the container "where do I dispense?"; the station asks "where
// does the sample sit, and is it tipped or aspirated to empty?". Coordinates are in
// the container's LOCAL space (the station adds its world x). These are geometry
// facts OWNED by the model — if a builder in demoScene.js moves a neck or a well,
// update the matching entry here.
//
// Fields:
//  vessel        — the sample-vessel key in demoScene's SAMPLE object
//  orientation   — 'upright' | 'flat' (drives seat + framing)
//  flat          — true if it lies flat ON the bench vs standing upright
//  spec          — the dimensions.json id of the real vessel it is (its SIZE comes from there)
//  (where a pipette delivers and how deep the tip goes are facts of the BUILT vessel —
//   vessel.userData.mouth / .entry, authored by its builder from the table — never numbers
//   typed here; its footprint is dims(spec).)
//  liquid        — 'column' (lathe) | 'well' | 'shallow' | 'film' | 'bands' | 'band'
//  emptyMotion   — 'tip' (tilt & pour) | 'aspirate' (pipette out — NEVER tip)
//  framing       — 'tall' | 'wide' (a tube and a T-flask can't share one camera)
//  contentsState — optional richer state (e.g. flask 'monolayer')
//  nestsIn       — [containers this vessel can DROP INTO as a nested insert]. This is
//                   what distinguishes the two kinds of "transfer": if the sample's
//                   SOURCE vessel nests into the DESTINATION, the transfer is a VESSEL
//                   MOVE (lift the insert and seat it — a spin column into a fresh
//                   collection tube). Otherwise it is a CONTENTS POUR: two vessels on
//                   the bench, the liquid carried A→B. Declared here, never hardcoded.

// Every vessel's origin is the centre of its base, so a vessel on the bench is at y=0.

export const CONTAINER_CONTRACT = {
  microtube:   { vessel: 'tube',      spec: 'microtube_1_5',    orientation: 'upright', flat: false, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  tube:        { vessel: 'tube',      spec: 'microtube_1_5',    orientation: 'upright', flat: false, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  spin_column: { vessel: 'column',    spec: 'spin_column_mini', orientation: 'upright', flat: false, liquid: 'column', emptyMotion: 'tip', framing: 'tall', nestsIn: ['tube', 'eluate_tube', 'microtube'] },
  eluate_tube: { vessel: 'elu',       spec: 'microtube_1_5',    orientation: 'upright', flat: false, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  // the 0.2 mL thin-wall PCR tube: the one vessel a thermocycler's 96-well block takes
  pcr_tube:    { vessel: 'pcrtube',   spec: 'pcr_tube_0_2',     orientation: 'upright', flat: false, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  cryovial:    { vessel: 'cryovial',  spec: 'cryovial_2ml',     orientation: 'upright', flat: false, capped: true, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  bottle:      { vessel: 'tube',      spec: 'microtube_1_5',    orientation: 'upright', flat: false, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  // flat-lying vessels — seat on the bench, aspirated (NEVER tipped), wide framing
  well_plate:  { vessel: 'wellplate', spec: 'microplate_96',    orientation: 'flat', flat: true, liquid: 'well', emptyMotion: 'aspirate', framing: 'wide' },
  flask:       { vessel: 'flask',     spec: 'flask_t75',        orientation: 'flat', flat: true, capped: true, liquid: 'shallow', emptyMotion: 'aspirate', framing: 'wide', contentsState: 'monolayer' },
  dish:        { vessel: 'dish',      spec: 'petri_90',         orientation: 'flat', flat: true, liquid: 'shallow', emptyMotion: 'aspirate', framing: 'wide' },
  slide:       { vessel: 'slide',     spec: 'slide_iso8037',    orientation: 'flat', flat: true, liquid: 'film', emptyMotion: 'aspirate', framing: 'wide', nestsIn: ['staining_tray'] },
  membrane:    { vessel: 'membrane',  spec: 'membrane_mini',    orientation: 'flat', flat: true, liquid: 'bands', emptyMotion: 'aspirate', framing: 'wide' },
  gel:         { vessel: 'gel',       spec: 'gel_tray_7x10',    orientation: 'flat', flat: true, liquid: 'band', emptyMotion: 'aspirate', framing: 'wide' },
  agar_plate:  { vessel: 'agarplate', spec: 'petri_90',         orientation: 'flat', flat: true, liquid: 'film', emptyMotion: 'aspirate', framing: 'wide' },
  generic:     { vessel: 'tube',      spec: 'microtube_1_5',    orientation: 'upright', flat: false, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
}

export function containerContract(token) {
  return CONTAINER_CONTRACT[token] || CONTAINER_CONTRACT.generic
}

// Does the sample's SOURCE container drop into the DESTINATION as a nested insert?
// True → a transfer is a VESSEL MOVE (lift & seat); false → a CONTENTS POUR (liquid
// carried A→B). Purely a lookup on the declared `nestsIn` — no hardcoded pairs.
export function nestsInto(sourceToken, destToken) {
  const src = CONTAINER_CONTRACT[sourceToken]
  return !!(src && src.nestsIn && src.nestsIn.includes(destToken))
}

// Classify a `transfer` from the CONTRACT so the renderer branches on a decision, not a
// tableau — and a test can pin it so a regression can't silently become a fill:
//   'nest'     — source nests into destination (spin_column → tube): the VESSEL moves,
//                lifted and seated into a clean tube; the liquid stays in the bed.
//   'contents' — different vessel, no nest (microtube → spin_column): the LIQUID is
//                pipetted A→B.
//   'rest'     — same vessel type, or no previous container: nothing to move. A FILL here
//                would be an `add` wearing a transfer's name, so the renderer holds + warns.
//   'place'    — a gel or membrane on either side: no liquid crosses (a blot moves
//                protein electrically), so NO pipette — both rest side by side (#5).
//                Except loading a gel from a tube-like vessel: that IS pipetted.
const NEVER_PIPETTED = new Set(['gel', 'membrane'])
export function transferKind(prevContainer, container) {
  const prev = prevContainer ? CONTAINER_CONTRACT[prevContainer] : null
  if (!prev) return 'rest'
  if (nestsInto(prevContainer, container)) return 'nest'
  const dst = CONTAINER_CONTRACT[container] || CONTAINER_CONTRACT.generic
  if (prev.vessel === dst.vessel) return 'rest'
  // the one exception: LOADING a gel's wells from a tube is a pipette run
  if (container === 'gel' && prev.orientation === 'upright') return 'contents'
  if (NEVER_PIPETTED.has(prevContainer) || NEVER_PIPETTED.has(container)) return 'place'
  return 'contents'
}

// The EQUIPMENT side of the contract: the containers each physical instrument ACCEPTS —
// a tube block does not take a 96-well plate; a NanoDrop does not read one. Which
// instrument a step uses is decided by sceneRecipe.resolveRecipe from the action, the
// sample's container AND the step's stated conditions; this table only says what fits.
export const INSTRUMENTS = {
  // incubate/hold family
  incubation_block: { accepts: ['microtube', 'tube', 'spin_column', 'eluate_tube', 'cryovial'] }, // dry tube block
  plate_shaker:     { accepts: ['well_plate', 'membrane'] },  // plate incubator / rocker
  co2_incubator:    { accepts: ['flask', 'dish'] },           // warm CO₂ cabinet
  // measure family
  plate_reader:        { accepts: ['well_plate'] },              // ELISA absorbance
  nanodrop:            { accepts: ['microtube', 'tube', 'eluate_tube', 'spin_column', 'cryovial'] },
  inverted_microscope: { accepts: ['flask', 'dish'] },           // observe adherent cells from below
  light_microscope:    { accepts: ['slide'] },                   // Gram / haemocytometer, 100× oil
  uv_transilluminator: { accepts: ['gel'] },                     // visualise DNA bands under UV
  water_bath:          { accepts: ['microtube', 'tube', 'spin_column', 'eluate_tube', 'cryovial'] },
  freezer:             { accepts: ['microtube', 'tube', 'spin_column', 'eluate_tube', 'cryovial', 'pcr_tube'] },
  ice_bucket:          { accepts: ['microtube', 'tube', 'spin_column', 'eluate_tube', 'cryovial', 'pcr_tube'] },
  thermocycler:        { accepts: ['pcr_tube'] },                 // 96-well block, 0.2 mL tubes only
}

// Side-by-side placement of a SOURCE (left) and DESTINATION (right) vessel: their facing
// edges are `gap` apart (the bench gap), each offset by its REAL half-width.
export function sideBySide(srcToken, dstToken, gap = clearance('bench_gap')) {
  const a = dims(containerContract(srcToken).spec), b = dims(containerContract(dstToken).spec)
  const srcFoot = { minX: -a.width / 2, maxX: a.width / 2 }, dstFoot = { minX: -b.width / 2, maxX: b.width / 2 }
  return { AX: -(gap / 2 + a.width / 2), BX: gap / 2 + b.width / 2, srcFoot, dstFoot }
}
