// Two COMPLETE, internally-coherent scene presets — surfaces + backdrop + fog + lights as
// one set each. The bench colour was never an isolated knob: Stage 24 moved the bench,
// backdrop, fog, key, fills and rim together, so a preset carries all of them. Nothing
// outside this file may hardcode a bench colour or a light intensity.
//
//   dark  — the Stage-24 look: near-black warm epoxy, dramatic side key, cool rim, dark
//           receding backdrop, warm near-black fog.
//   light — the pre-Stage-24 look, restored verbatim from git (values tuned over many
//           rounds — taken from the commit before Stage 24, not re-derived by eye).
//
// Colours: canvas fills are strings; light intensities/colours are numbers (0x…). Consumed
// by demoScene.buildFloor / makeCineBackdrop and StationScene's <Lights> + frame loop.

const DARK = {
  name: 'dark',
  bench: {
    texBase: '#131010',
    streak: { rgb: '150,146,138', a0: 0.004, a1: 0.008 },
    fleck: { count: 1500, paleProb: 0.68, pale: '224,218,206', dark: '70,66,60', paleA0: 0.035, paleA1: 0.06, darkA0: 0.10, darkA1: 0.06, size0: 0.9, size1: 1.2 },
    rough: { base: '#efefef', count: 5, r0: 45, r1: 65, patch: '150,150,150', patchA: 0.28, repeat: [8, 2] },
    mat: { color: 0x0a0807, metalness: 0.02, roughness: 0.9, env: 0.04 },
  },
  backdrop: {
    stops: [[0.0, '#1b1714'], [0.42, '#181410'], [0.585, '#120f0b'], [0.615, '#0e0b08'], [0.80, '#0b0906'], [1.0, '#080605']],
    pool: { cy1: 0.42, r1: 0.72, rgb: '150,128,98', a: 0.22 },
    vignette: { r0: 0.24, r1: 0.78, rgb: '0,0,0', a: 0.55 },
  },
  lights: {
    fog: { color: 0x120f0b, density: 0.0034 }, exposure: 0.78,
    amb: { color: 0xd6d9de, int: 0.035 }, hemi: { sky: 0xc4ccd8, ground: 0x241f18, int: 0.045 },
    key: { color: 0xfff1de, int: 1.62 }, fill: { color: 0xc2cee2, int: 0.08, pos: [-8, 4, 9] },
    aux: { color: 0xdfe0da, int: 0.05, pos: [-3, 11, -6] },
    rim: { color: 0xe3ecff, int: 0.9 },
    keyPos: [6.5, 8.5, 5], keyTarget: [0, 0.6, 0],
    rimPos: [-6, 5.5, -8], rimTarget: [0, 1.2, 0],
  },
}

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

export const SCENE_PRESETS = { dark: DARK, light: LIGHT }

export function resolveScenePreset(name) {
  return SCENE_PRESETS[name] || SCENE_PRESETS.dark
}
