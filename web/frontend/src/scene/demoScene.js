// ─────────────────────────────────────────────────────────────────────────
// demoScene.js — lifted VERBATIM from demos/neutrophil-rna-extraction.html.
//
// The ONLY changes from the demo source are the required modern-three ports:
//   • the r128 global THREE.* now comes from `import * as THREE from 'three'`
//   • texture  .encoding = THREE.sRGBEncoding  →  .colorSpace = THREE.SRGBColorSpace
//   • the shader chunk  opaque_fragment  →  opaque_fragment  (in fresnelize)
// Every number, lathe profile, material value and animation line is IDENTICAL.
//
// `renderer` is a module global set by the React layer (as it was in the demo's
// scene scope) so buildEnvMap() can build its PMREM env map.
// ─────────────────────────────────────────────────────────────────────────
/* eslint-disable */

export * from './palette.js'
export * from './util.js'
export * from './materials.js'
export * from './labels.js'
export * from './liquid.js'
export * from './modelKit.js'
export * from './vessels.js'
export * from './props.js'
export * from './instruments/thermal.js'
export * from './instruments/motion.js'
export * from './instruments/readers.js'
export * from './instruments/gel.js'
export * from './instruments/staining.js'
export * from './environment.js'
export * from './sample.js'
export * from './bench.js'
export * from './pipetting.js'
export * from './spin.js'
export * from './holders.js'


