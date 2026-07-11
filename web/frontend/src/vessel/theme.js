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
  env: {
    resolution: 256,
    base: '#565b63', // env base — a dark neutral grey (NOT light)
    key: { intensity: 1.6, position: [9, 13, 7], scale: [16, 9, 1], color: '#ffffff' },
    fillL: { intensity: 0.42, position: [-11, 7, -7], scale: [12, 11, 1], color: '#9198a1' },
    fillR: { intensity: 0.32, position: [-6, 3, 9], scale: [10, 7, 1], color: '#878d96' },
    rim: { intensity: 0.4, position: [0, 16, -3], scale: [18, 12, 1], color: '#6a6f77' },
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

  // Warm exponential fog for depth on the receding bench (blends distant objects
  // into the greige background). Demo: FogExp2(0xbcb7ae, 0.0028) over a longer
  // bench; a touch denser here for the tighter hero framing.
  fog: { color: '#bcb7ae', density: 0.02 },

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

  // Real glass. transmission=1 + refraction; tuned so it reads as clean lab
  // borosilicate, not frosted plastic.
  // HERO glass — true transmissive <MeshTransmissionMaterial> for the ONE active
  // vessel: it refracts the background AND catches a crisp key-softbox highlight.
  // Costly (renders a buffer), so only the hero uses it; neighbours fall back to
  // `glassFallback`. Resolution/samples kept modest for 60fps.
  glass: {
    color: '#eef4f6',
    transmission: 1,
    roughness: 0.04, // very low → tack-sharp key highlight + clean edges
    ior: 1.45,
    thickness: 0.35,
    chromaticAberration: 0.02,
    anisotropicBlur: 0.06, // low so refraction stays crisp, not softened
    distortionScale: 0,
    temporalDistortion: 0,
    samples: 8,
    resolution: 384, // crisp refraction (not so low it smears the background)
    envMapIntensity: 1.7,
  },

  // Cheap physical glass for neighbour vessels — still refracts + reflects, no
  // per-frame buffer. Reads as clean borosilicate under the studio key.
  glassFallback: {
    color: '#eef4f6',
    transmission: 1,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    ior: 1.45,
    thickness: 0.35,
    envMapIntensity: 1.6,
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

  // Filmic post stack — tasteful, not an effects demo.
  //  bloom: only highlights/emissive bloom (never a haze)
  //  dof:   focus the active station, small gentle bokeh
  //  ao:    soft ambient occlusion darkens crevices (rotor slots, wells, contacts)
  //  vignette: subtle edge settle
  post: {
    // bloom only on speculars/emissive (high threshold, modest intensity) — never
    // a soft haze over the whole frame
    bloom: { intensity: 0.34, luminanceThreshold: 0.9, luminanceSmoothing: 0.2, mipmapBlur: true },
    // DOF focus LOCKED on the hero (active station at world origin); small bokeh
    // so ONLY neighbours + far background blur and the hero stays razor sharp
    dof: { target: [0, 0.95, 0], focalLength: 0.012, bokehScale: 1.3, focusRange: 0.004 },
    ao: { aoRadius: 0.5, intensity: 2.2, distanceFalloff: 0.4, color: '#0c0f13', halfRes: true },
    vignette: { offset: 0.28, darkness: 0.52 },
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
