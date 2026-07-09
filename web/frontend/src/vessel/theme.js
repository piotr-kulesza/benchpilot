// ─────────────────────────────────────────────────────────────────────────
// theme.js — the single place to art-direct the 3D vessel.
//
// Everything visual about the scene (glass, liquid, lighting, post, background)
// is a knob here so the look can be tuned fast without hunting through the
// scene components. Change values, save, watch it update.
// ─────────────────────────────────────────────────────────────────────────

export const theme = {
  // Background behind the glass (CSS gradient on the stage; the canvas is
  // transparent so this shows through and the scene feels grounded in the card).
  background: {
    top: '#f2f5f6',
    bottom: '#e4eaec',
  },

  // In-scene gradient backdrop the glass refracts (top light → deeper base) so
  // clear glass reads with real form instead of vanishing on a flat colour.
  backdrop: {
    stops: [0, 0.55, 1],
    colors: ['#fbfcfc', '#dbe4e7', '#aebdc2'],
  },

  // Camera framing — slight perspective, vessel centered with headroom.
  camera: {
    position: [0, 0.35, 4.15],
    fov: 30,
    lookAt: [0, -0.05, 0],
  },

  // Studio lighting built from area lights (Lightformers) inside <Environment>,
  // so we get real reflections with NO external HDRI file and NO network. The
  // env base is a LIGHT studio grey so the glass reads as clean glass (a dark
  // base makes transmission glass look like chrome).
  env: {
    resolution: 256,
    base: '#b3bdc2', // env cubemap base — mid studio grey
    // key = big soft top box, fills = sides, rim = bright edge kicker.
    // Kept moderate so the glass gets crisp highlights, not a blown-out sheen
    // that hides the liquid.
    key: { intensity: 1.0, position: [0, 5, 2], scale: [9, 9, 1], color: '#ffffff' },
    fillL: { intensity: 0.8, position: [-5, 1.5, 2.5], scale: [5, 8, 1], color: '#eef4fb' },
    fillR: { intensity: 1.15, position: [5, 0.5, 2], scale: [5, 8, 1], color: '#ffffff' },
    rim: { intensity: 1.5, position: [0, -1, -4], scale: [8, 5, 1], color: '#dcebff' },
  },

  // Uniform scale applied to the vessel so the full silhouette frames with
  // headroom.
  vesselScale: 0.82,

  // Real glass. transmission=1 + refraction; tuned so it reads as clean lab
  // borosilicate, not frosted plastic.
  glass: {
    color: '#f4f8f9',
    transmission: 1,
    thickness: 0.22, // thin → clear (less milky), so the liquid reads through it
    roughness: 0.05,
    ior: 1.5,
    chromaticAberration: 0.04,
    anisotropy: 0.1,
    // perf: keep samples/resolution modest for 60fps on a laptop
    samples: 6,
    resolution: 256,
    backside: false,
    backsideThickness: 0.18,
    attenuationColor: '#eefbf8',
    attenuationDistance: 6,
    envMapIntensity: 0.85,
  },

  // Liquid — a separate inner mesh, gently colored + slightly translucent, with
  // a domed meniscus. Default accent when no reagent color is known.
  liquid: {
    accent: '#16b8a6', // benchpilot teal
    opacity: 0.96,
    roughness: 0.22,
    ior: 1.34,
    baseFill: 0.5, // fraction of inner height, 0..1 (behaviors override)
    surfaceTintBoost: 1.12,
  },

  // Cohesive per-reagent coloring — keyed by keyword, else `liquid.accent`.
  // Restrained (all within a calm cool range) so the scene never goes rainbow.
  reagentColors: [
    { match: ['ethanol', 'etanol', 'isopropanol', 'water', 'woda', 'rnase-free'], color: '#9fd6ea' },
    { match: ['rlt', 'rw1', 'rpe', 'buffer', 'bufor', 'guanidin'], color: '#12a794' },
    { match: ['dnase', 'rdd', 'enzyme'], color: '#2f8fd6' },
    { match: ['soc', 'lb', 'medium', 'media', 'agar'], color: '#d9a52e' },
    { match: ['trizol', 'phenol', 'chloroform'], color: '#d96379' },
    { match: ['mercapto', '2-me', 'reducing'], color: '#7385cf' },
  ],

  // Accent used for glows, rings, gauges (heat glow overrides warm).
  accents: {
    ring: '#16b8a6',
    warm: '#ff8a3d',
    cold: '#5fb8f0',
    drop: '#16b8a6',
  },

  // Soft grounding shadow.
  shadow: {
    opacity: 0.42,
    blur: 2.6,
    far: 3.2,
    scale: 8,
    position: [0, -0.98, 0],
    color: '#22423d',
  },

  // Restrained post — premium highlights, faint vignette. Never blown-out.
  post: {
    bloom: { intensity: 0.32, luminanceThreshold: 0.85, luminanceSmoothing: 0.2, mipmapBlur: true },
    vignette: { offset: 0.3, darkness: 0.5 },
  },

  // "Alive at rest" — gentle idle bob + slow camera drift.
  motion: {
    floatSpeed: 1.1,
    floatRotation: 0.18,
    floatIntensity: 0.5,
    cameraDrift: 0.12, // radians of slow horizontal sway
    cameraDriftSpeed: 0.22,
  },
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
