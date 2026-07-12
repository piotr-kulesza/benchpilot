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
//  flat          — true if it rests ON the bench (y≈0) vs at block-top height
//  seat          — {x,y,z} resting pose (y is overridden to 0 when flat)
//  dispense      — {x,y,z, approach} where a pipette delivers into it
//                   approach: 'top' (straight down) | 'angled' (in through a neck)
//  liquid        — 'column' (lathe) | 'well' | 'shallow' | 'film' | 'bands' | 'band'
//  emptyMotion   — 'tip' (tilt & pour) | 'aspirate' (pipette out — NEVER tip)
//  framing       — 'tall' | 'wide' (a tube and a T-flask can't share one camera)
//  contentsState — optional richer state (e.g. flask 'monolayer')

const BT = 0.45 // demo.BLOCK_TOP — tubes seat here; flat vessels at 0

export const CONTAINER_CONTRACT = {
  microtube:   { vessel: 'tube',      orientation: 'upright', flat: false, seat: { x: 0, y: BT, z: 0 }, dispense: { x: 0, y: BT + 0.9, z: 0, approach: 'top' }, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  tube:        { vessel: 'tube',      orientation: 'upright', flat: false, seat: { x: 0, y: BT, z: 0 }, dispense: { x: 0, y: BT + 0.9, z: 0, approach: 'top' }, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  spin_column: { vessel: 'column',    orientation: 'upright', flat: false, seat: { x: 0, y: BT, z: 0 }, dispense: { x: 0, y: BT + 0.9, z: 0, approach: 'top' }, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  eluate_tube: { vessel: 'elu',       orientation: 'upright', flat: false, seat: { x: 0, y: BT, z: 0 }, dispense: { x: 0, y: BT + 0.7, z: 0, approach: 'top' }, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  cryovial:    { vessel: 'cryovial',  orientation: 'upright', flat: false, seat: { x: 0, y: BT, z: 0 }, dispense: { x: 0, y: BT + 0.7, z: 0, approach: 'top' }, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  bottle:      { vessel: 'tube',      orientation: 'upright', flat: false, seat: { x: 0, y: BT, z: 0 }, dispense: { x: 0, y: BT + 0.9, z: 0, approach: 'top' }, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
  // flat-lying vessels — seat on the bench, aspirated (NEVER tipped), wide framing
  well_plate:  { vessel: 'wellplate', orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: -0.98, y: 0.55, z: 0.77, approach: 'top' }, liquid: 'well', emptyMotion: 'aspirate', framing: 'wide' },
  flask:       { vessel: 'flask',     orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 1.15, y: 0.7, z: 0.4, approach: 'angled' }, liquid: 'shallow', emptyMotion: 'aspirate', framing: 'wide', contentsState: 'monolayer' },
  dish:        { vessel: 'dish',      orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.35, z: 0, approach: 'top' }, liquid: 'shallow', emptyMotion: 'aspirate', framing: 'wide' },
  slide:       { vessel: 'slide',     orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0.35, y: 0.35, z: 0, approach: 'top' }, liquid: 'film', emptyMotion: 'aspirate', framing: 'wide' },
  membrane:    { vessel: 'membrane',  orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.35, z: 0, approach: 'top' }, liquid: 'bands', emptyMotion: 'aspirate', framing: 'wide' },
  gel:         { vessel: 'gel',       orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: -0.36, y: 0.45, z: -0.4, approach: 'top' }, liquid: 'band', emptyMotion: 'aspirate', framing: 'wide' },
  agar_plate:  { vessel: 'agarplate', orientation: 'flat', flat: true, seat: { x: 0, y: 0, z: 0 }, dispense: { x: 0, y: 0.5, z: 0, approach: 'top' }, liquid: 'film', emptyMotion: 'aspirate', framing: 'wide' },
  generic:     { vessel: 'tube',      orientation: 'upright', flat: false, seat: { x: 0, y: BT, z: 0 }, dispense: { x: 0, y: BT + 0.9, z: 0, approach: 'top' }, liquid: 'column', emptyMotion: 'tip', framing: 'tall' },
}

export function containerContract(token) {
  return CONTAINER_CONTRACT[token] || CONTAINER_CONTRACT.generic
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
  plate_reader:     { accepts: ['well_plate'] },              // ELISA absorbance
  nanodrop:         { accepts: ['microtube', 'tube', 'eluate_tube', 'spin_column', 'cryovial'] },
}

const FAMILY = {
  incubate: ['incubation_block', 'plate_shaker', 'co2_incubator'],
  measure: ['plate_reader', 'nanodrop'],
}

// Resolve (family, container) → instrument id, or 'bench' when nothing fits.
export function resolveInstrument(family, container) {
  for (const id of FAMILY[family] || []) {
    if (INSTRUMENTS[id].accepts.includes(container)) return id
  }
  return 'bench'
}
