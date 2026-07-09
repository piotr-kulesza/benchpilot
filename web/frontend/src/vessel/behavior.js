// ─────────────────────────────────────────────────────────────────────────
// behavior.js — pure action → vessel-behavior mapping.
//
// The 3D scene is ONE vessel whose STATE changes per action. This module maps
// each action in the fixed vocabulary to a plain descriptor of how the vessel
// behaves. It imports nothing heavy (no three.js), so it is unit-testable in
// node and guarantees every action resolves (unknown → generic).
//
// Descriptor fields (all optional, sensible defaults in `base`):
//   fill        base liquid fill fraction (0..1)
//   swirl       liquid swirl speed (vortex)
//   shake       vessel wobble amplitude (vortex/discard)
//   spin        fast Y spin speed (centrifuge)
//   pour        second bottle pours a stream; fill rises
//   pipette     pipette tip descends, releases drops; surface ripples
//   drop        a single slow drop falls in (elute)
//   bubbles     rising bubbles (heat)
//   warm        warm glow + emissive (heat)
//   frost       frost creeps up the glass + cold cast (cool_ice)
//   pulse       gentle liquid pulse amplitude (incubate)
//   ring        progress ring driven by the timer (incubate)
//   transfer    a second vessel; contents move across
//   tip         pour-out tip angle in radians (discard)
//   flowThrough liquid rinses through (wash)
//   gauge       show a measurement gauge beside the vessel (measure)
// ─────────────────────────────────────────────────────────────────────────

const base = {
  fill: 0.5,
  swirl: 0,
  shake: 0,
  spin: 0,
  pour: false,
  pipette: false,
  drop: false,
  bubbles: false,
  warm: false,
  frost: false,
  pulse: 0,
  ring: false,
  transfer: false,
  tip: 0,
  flowThrough: false,
  gauge: false,
}

const b = (over) => ({ ...base, ...over })

export const BEHAVIORS = {
  pour_add: b({ fill: 0.28, pour: true }),
  pipette_mix: b({ fill: 0.55, pipette: true }),
  vortex_mix: b({ fill: 0.55, swirl: 6.5, shake: 0.05 }),
  centrifuge: b({ fill: 0.5, spin: 18 }),
  incubate_wait: b({ fill: 0.55, pulse: 0.03, ring: true }),
  heat: b({ fill: 0.55, bubbles: true, warm: true }),
  cool_ice: b({ fill: 0.55, frost: true }),
  transfer: b({ fill: 0.5, transfer: true }),
  wash: b({ fill: 0.5, flowThrough: true }),
  discard: b({ fill: 0.2, tip: 1.15, shake: 0.02 }),
  elute: b({ fill: 0.22, drop: true }),
  measure: b({ fill: 0.55, gauge: true }),
  generic: b({ fill: 0.5 }),
}

// Resolve an action to its behavior descriptor; unknown / missing → generic.
export function resolveBehavior(action) {
  return BEHAVIORS[action] || BEHAVIORS.generic
}
