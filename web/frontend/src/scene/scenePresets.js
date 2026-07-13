// The ONE, COMPLETE, internally-coherent scene preset — surfaces + backdrop + fog + lights
// as one set. The bench colour was never an isolated knob: Stage 24 moved the bench,
// backdrop, fog, key, fills and rim together, so the preset carries all of them. Nothing
// outside this file may hardcode a bench colour or a light intensity.
//
//   light — a bright, even studio bench: pale epoxy, soft key, no rim, light receding
//           backdrop. (Dark mode was removed; this is the only look.)
//
// Colours: canvas fills are strings; light intensities/colours are numbers (0x…). Consumed
// by demoScene.buildFloor / makeCineBackdrop and StationScene's <Lights> + frame loop.

const LIGHT = {
  name: 'light',
  bench: {
    texBase: '#cbc6bd',
    streak: { rgb: '120,116,108', a0: 0.008, a1: 0.012 },
    fleck: { count: 1200, paleProb: 0.5, pale: '255,253,248', dark: '150,144,134', paleA0: 0, paleA1: 0.05, darkA0: 0, darkA1: 0.05, size0: 1.6, size1: 0 },
    rough: null,
    mat: { color: 0xcfd2d3, metalness: 0.12, roughness: 0.5, env: 0.62 },
  },
  backdrop: {
    stops: [[0.0, '#b9b4b7'], [0.42, '#ada8ab'], [0.585, '#9d978d'], [0.615, '#918b81'], [0.80, '#827d74'], [1.0, '#6f6a61']],
    pool: { cy1: 0.40, r1: 0.80, rgb: '244,238,228', a: 0.30 },
    vignette: { r0: 0.30, r1: 0.75, rgb: '42,38,33', a: 0.34 },
  },
  lights: {
    fog: { color: 0xbcb7ae, density: 0.0028 }, exposure: 0.78,
    amb: { color: 0xd6d9de, int: 0.12 }, hemi: { sky: 0xdde4ee, ground: 0xb4aea4, int: 0.20 },
    key: { color: 0xfff3e2, int: 1.32 }, fill: { color: 0xccd4de, int: 0.17, pos: [-8, 4, 9] },
    aux: { color: 0xe2e0d8, int: 0.14, pos: [-3, 11, -6] },
    rim: null,
    keyPos: [5, 11, 7], keyTarget: [0, 0.6, 0],
  },
}

export const SCENE_PRESETS = { light: LIGHT }

// One scene preset only (the light bench). Kept as a function so callers don't change.
export function resolveScenePreset() {
  return LIGHT
}
