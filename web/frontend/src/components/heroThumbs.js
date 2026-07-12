// Each example card shows a pre-rendered 3D thumbnail of the ONE piece of equipment it is
// known for — the picture does the arguing that this generalises to real, different
// glassware. Rendered at build-time from the same models (scripts/thumbs.mjs) to
// public/thumbs/<item>.png, referenced by URL so a missing image degrades to the chips,
// never a broken build.
export const HERO_ITEM = {
  neutrophil_rna: 'nanodrop',
  transformation: 'agar_plate',
  pcr: 'thermocycler',
  western: 'membrane',
  passaging: 'flask',
  elisa: 'well_plate',
  agarose_gel: 'gel_rig',
  cryopreservation: 'cryovial',
  gram_stain: 'staining_tray',
}

// Both bench presets are pre-rendered (thumbs-dark/, thumbs-light/); pick by the active
// scene preset so a light bench never shows dark thumbnails.
export function heroThumb(exampleId, bench = 'dark') {
  const item = HERO_ITEM[exampleId]
  return item ? `thumbs-${bench === 'light' ? 'light' : 'dark'}/${item}.png` : null
}
