// theme.js — the ONLY remaining art-direction knob on our side: the reagent →
// liquid-colour mapping used to tint the travelling sample per step. Everything
// else visual (geometry, materials, lighting, env, background, labels, decals,
// animations) now comes from the demo's own code in ../scene/demoScene.js.
//
// Colours are the demo's COL_CINE palette, keyed by reagent keyword.

export const theme = {
  liquid: {
    accent: '#02b6a0', // demo COL.lysis — default when no reagent keyword matches
  },

  // Per-reagent colouring — the demo's COL_CINE palette. Order matters:
  // β-mercaptoethanol is part of the RLT LYSIS buffer, so it reads teal
  // (COL.lysis), not a separate colour.
  reagentColors: [
    { match: ['rlt', 'β-me', 'b-me', '2-me', 'mercapto', 'reducing', 'lysis', 'guanidin', 'lizuj'], color: '#02b6a0' }, // lysis teal
    { match: ['ethanol', 'etanol', 'etoh', 'isopropanol'], color: '#1f8bf2' }, // ethanol blue
    { match: ['rw1', 'rpe', 'wash', 'przemyw', 'buffer', 'bufor'], color: '#5061db' }, // wash periwinkle
    { match: ['dnase', 'rdd', 'enzyme'], color: '#f2a208' }, // DNase amber
    { match: ['rna', 'eluat', 'eluate'], color: '#12c46c' }, // eluate / RNA green
    { match: ['water', 'woda', 'rnase-free', 'h₂o', 'h2o'], color: '#53b4ef' }, // water sky blue
  ],
}

// Resolve a liquid color from a reagent name (keyword match), else the accent.
export function reagentColor(name) {
  if (!name) return theme.liquid.accent
  const n = String(name).toLowerCase()
  for (const { match, color } of theme.reagentColors) {
    if (match.some((m) => n.includes(m))) return color
  }
  return theme.liquid.accent
}
