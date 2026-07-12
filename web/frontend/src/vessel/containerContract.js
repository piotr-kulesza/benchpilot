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
//  seat          — {x,y,z} BENCH resting pose. y is the vessel BASE height: every
//                   vessel model has its origin AT its base, so a bench rest is y=0 —
//                   the lowest vertex touches the bench plane (Stage-13 #2: no float).
//                   A station that places the vessel ON/IN equipment (a bath, an ice
//                   bucket, a rotor slot) overrides this with its own height; the
//                   CONTRACT owns only the at-rest bench pose.
//  dispense      — {x,y,z, approach} where a pipette delivers into it
//                   approach: 'top' (straight down) | 'angled' (in through a neck)
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

// Upright vessels rest with their BASE on the bench (y=0) — their origin is at the
// base, so y=0 puts the lowest vertex on the bench plane. `dispense.y` is the mouth
// height ABOVE that base (where a pipette delivers). No BLOCK_TOP float (Stage-13 #2).
//
// `entryPoint` — the local y (above the base) the pipette TIP descends to when it
// dispenses INTO this container. It is per-container, not one tube-shaped constant:
// a microtube takes the tip near its base; a SPIN COLUMN takes it just below the rim
// and ABOVE the bed/frit (the membrane sits at y≈0.9 — the tip must never cross it);
// a well/dish/slide sits at the shallow surface. Flasks are entered through the canted
// neck (approach:'angled' + dispense.depth), so entryPoint doesn't apply to them.

export const CONTAINER_CONTRACT = {
  microtube:   { vessel: 'tube',      orientation: 'upright', flat: false, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.9, z: 0, approach: 'top' }, entryPoint: 0.55, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  tube:        { vessel: 'tube',      orientation: 'upright', flat: false, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.9, z: 0, approach: 'top' }, entryPoint: 0.55, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  spin_column: { vessel: 'column',    orientation: 'upright', flat: false, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 1.35, z: 0, approach: 'top' }, entryPoint: 1.2, liquid: 'column', emptyMotion: 'tip', framing: 'tall', nestsIn: ['tube', 'eluate_tube', 'microtube'] },
  eluate_tube: { vessel: 'elu',       orientation: 'upright', flat: false, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.7, z: 0, approach: 'top' }, entryPoint: 0.42, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  cryovial:    { vessel: 'cryovial',  orientation: 'upright', flat: false, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.7, z: 0, approach: 'top' }, entryPoint: 0.45, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  bottle:      { vessel: 'tube',      orientation: 'upright', flat: false, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.9, z: 0, approach: 'top' }, entryPoint: 0.7, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  // flat-lying vessels — seat on the bench, aspirated (NEVER tipped), wide framing
  well_plate:  { vessel: 'wellplate', orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: -0.98, y: 0.55, z: 0.77, approach: 'top' }, entryPoint: 0.5, liquid: 'well', emptyMotion: 'aspirate', framing: 'wide' },
  flask:       { vessel: 'flask',     orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 1.45, y: 1.0, z: 0.41, approach: 'angled', tilt: -0.62, depth: 0.95 }, liquid: 'shallow', emptyMotion: 'aspirate', framing: 'wide', contentsState: 'monolayer' },
  dish:        { vessel: 'dish',      orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.35, z: 0, approach: 'top' }, entryPoint: 0.3, liquid: 'shallow', emptyMotion: 'aspirate', framing: 'wide' },
  slide:       { vessel: 'slide',     orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0.35, y: 0.35, z: 0, approach: 'top' }, entryPoint: 0.3, liquid: 'film', emptyMotion: 'aspirate', framing: 'wide', nestsIn: ['staining_tray'] },
  membrane:    { vessel: 'membrane',  orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.35, z: 0, approach: 'top' }, entryPoint: 0.3, liquid: 'bands', emptyMotion: 'aspirate', framing: 'wide' },
  gel:         { vessel: 'gel',       orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: -0.36, y: 0.45, z: -0.4, approach: 'top' }, entryPoint: 0.4, liquid: 'band', emptyMotion: 'aspirate', framing: 'wide' },
  agar_plate:  { vessel: 'agarplate', orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.5, z: 0, approach: 'top' }, entryPoint: 0.45, liquid: 'film', emptyMotion: 'aspirate', framing: 'wide' },
  generic:     { vessel: 'tube',      orientation: 'upright', flat: false, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.9, z: 0, approach: 'top' }, entryPoint: 0.55, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
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
export function transferKind(prevContainer, container) {
  const prev = prevContainer ? CONTAINER_CONTRACT[prevContainer] : null
  if (!prev) return 'rest'
  if (nestsInto(prevContainer, container)) return 'nest'
  const dst = CONTAINER_CONTRACT[container] || CONTAINER_CONTRACT.generic
  return prev.vessel !== dst.vessel ? 'contents' : 'rest'
}

// Equipment declares where a container sits inside it and the PATH the container
// follows to get there (never a naive lerp toward a point). Consumed by the
// station branches (centrifuge rotor slot, freezer door, gel tank).
export const EQUIPMENT_CONTRACT = {
  centrifuge:  { seat: { x: 1.4, y: 0.3, z: 0.03 }, approachPath: 'drop-into-slot' },
  freezer:     { seat: { x: 0.1, y: 0.4, z: -1.0 }, approachPath: 'through-door' },
  gel_rig:     { seat: { x: -1.7, y: 0.45, z: 0.9 }, approachPath: 'slide-in' },
  thermocycler:{ seat: { x: 0, y: 0.5, z: 0.0 }, approachPath: 'drop-into-well' },
  water_bath:  { seat: { x: 0, y: 0.1, z: 0 }, approachPath: 'lower-in' },
  reader:      { seat: { x: -1.4, y: 0, z: 0.8 }, approachPath: 'place' },
  staining_tray: { seat: { x: 0, y: 0.28, z: 0 }, approachPath: 'place' },
}

export function equipmentContract(token) {
  return EQUIPMENT_CONTRACT[token] || null
}

// The EQUIPMENT side of the contract: which physical instrument an (action-family,
// container) pair uses. Each instrument lists the containers it ACCEPTS — a tube
// block does not take a 96-well plate; a NanoDrop does not read one. If no
// instrument accepts the container, fall back to the BENCH: a wrong instrument is
// worse than none.
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
}

const FAMILY = {
  incubate: ['incubation_block', 'plate_shaker', 'co2_incubator'],
  measure: ['plate_reader', 'nanodrop', 'inverted_microscope', 'light_microscope', 'uv_transilluminator'],
}

// Resolve (family, container) → instrument id, or 'bench' when nothing fits.
export function resolveInstrument(family, container) {
  for (const id of FAMILY[family] || []) {
    if (INSTRUMENTS[id].accepts.includes(container)) return id
  }
  return 'bench'
}
