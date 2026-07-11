// ─────────────────────────────────────────────────────────────────────────
// theme.js — the single place to art-direct the 3D vessel.
//
// Everything visual about the scene (glass, liquid, lighting, post, background)
// is a knob here so the look can be tuned fast without hunting through the
// scene components. Change values, save, watch it update.
// ─────────────────────────────────────────────────────────────────────────

export const theme = {
  // Background behind the scene (CSS gradient on the stage; the canvas is
  // transparent so this shows through). A COMFORTABLE WARM MID-TONE greige —
  // NOT a white void, NOT dark sci-fi — grading from a light warm wall down to a
  // deeper warm-grey floor (ported from the demo's makeCineBackdrop).
  background: {
    top: '#b9b4ab',
    bottom: '#6f6a61',
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

  // DARK NEUTRAL STUDIO IBL (Lightformers inside <Environment>): ONE bright key
  // softbox for highlights + form, DARK fills all around so materials keep
  // contrast and true colour. A near-white env floods every surface pale — that
  // was the washed-out bug. (Ported from the demo's cinematic buildEnvMap.)
  // Values are the demo's buildEnvMap('cinematic') panels, verbatim: one bright
  // white key softbox + three DIM neutral fills, over a dark neutral base.
  env: {
    resolution: 256,
    base: '#686d75', // ~mid of the demo dome gradient (0x474b51 → 0x8d929a)
    key: { intensity: 1.5, position: [9, 14, 7], scale: [22, 10, 1], color: '#ffffff' },
    fillL: { intensity: 0.42, position: [-13, 8, -8], scale: [16, 14, 1], color: '#9198a1' },
    fillR: { intensity: 0.32, position: [-6, 3, 10], scale: [12, 7, 1], color: '#878d96' },
    rim: { intensity: 0.38, position: [0, 20, 0], scale: [24, 24, 1], color: '#676c74' },
  },

  // Explicit scene lights (on top of the IBL) — low flat ambient/hemi + ONE
  // strong warm key → real shadow-to-highlight range and soft grounded contact
  // shadows. Values are LOOK.cinematic from the demo, verbatim.
  lights: {
    ambient: { color: '#d6d9de', intensity: 0.12 },
    hemi: { sky: '#dde4ee', ground: '#b4aea4', intensity: 0.2 },
    key: { color: '#fff3e2', intensity: 1.32, position: [5, 11, 7] },
    fill: { color: '#ccd4de', intensity: 0.17, position: [-8, 4, 9] },
    aux: { color: '#e2e0d8', intensity: 0.14, position: [-3, 11, -6] },
  },

  // Warm exponential fog for depth — the demo's FogExp2(0xbcb7ae, 0.0028),
  // verbatim (barely-there near the hero; blends the far bench into the greige).
  fog: { color: '#bcb7ae', density: 0.0028 },

  // The bench slab: a warm mid-grey, a little DARKER than the background wall and
  // GENTLY reflective (soft sheen, not a mirror).
  bench: { color: '#6e685f', metalness: 0.14, roughness: 0.48, envMapIntensity: 0.55 },

  // One-time HSL saturation boost applied to object materials after each station
  // mounts — neutrals barely move (low sat × factor stays low), coloured
  // liquids/caps/accents pop.
  saturation: 1.5,

  // Uniform scale applied to the vessel so the full silhouette frames with
  // headroom.
  vesselScale: 0.82,

  // The demo's glassMaterial(), verbatim — a STYLIZED faked glass: a plain
  // MeshPhysicalMaterial with low opacity + a fresnel rim (see equipment/Glass),
  // NO transmission/ior/thickness/refraction. This is what reads as the demo's
  // clean, crisp lab glass rather than a photoreal transmissive render. One
  // material for every vessel (no hero/neighbour split).
  glass: {
    color: '#dce6ec', // demo COL.glass
    roughness: 0.08,
    opacity: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.35,
    reflectivity: 0.4,
  },

  // Frosted polypropylene (spin-column cup) — translucent, matte-ish, still lit.
  frosted: {
    color: '#e2e9f0',
    roughness: 0.5,
    transmission: 0.4,
    thickness: 0.4,
    clearcoat: 0.3,
    clearcoatRoughness: 0.5,
    ior: 1.46,
    envMapIntensity: 0.9,
  },

  // Liquid — a glossy, slightly translucent physical material with a domed
  // meniscus at the surface (not a flat opaque disc). Strong colour reads through
  // the glass. Default accent when no reagent color is known.
  liquid: {
    accent: '#16b8a6', // benchpilot teal
    roughness: 0.1,
    transmission: 0.14,
    thickness: 1.2,
    ior: 1.34,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    emissiveIntensity: 0.12,
    envMapIntensity: 0.9,
    baseFill: 0.5,
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

  // No postprocessing — the demo has none. The scene reads crisp/stylized
  // straight from the renderer (LinearToneMapping, exposure 0.78) with no
  // EffectComposer, bloom, DOF, AO, or vignette.

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
