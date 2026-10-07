// tempo.js — THE ONE TEMPO KNOB for every motion in the scene.
//
// The frame loop (vessel/StationScene.jsx) divides each frame's dt by the tempo before it
// reaches anything that moves: a step's progress p, the centrifuge's absolute-time dock/lid/spin
// choreography, every builder's update(dt) (lids, rotors, pipette), and the vessels' trips and
// springs. A liquid is set by the same timeline in the same frame, so level and colour stay on
// the plunger's / stream's clock. Easing curves are untouched — only time is stretched.
// NOT scaled: a protocol timer (a 15 s spin is 15 s on the clock) and the camera.
// 1 = the demo's original speed; 1.6 = every motion 1.6× slower.
export const ANIMATION_TEMPO = 1.6

// What the scene reads. DEV only: scripts/tempo-ratio.mjs runs the line at tempo 1 and at
// ANIMATION_TEMPO (window.__benchTempo) to prove every motion stretches by the same factor.
export function animationTempo() {
  if (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined' && window.__benchTempo > 0) return window.__benchTempo
  return ANIMATION_TEMPO
}
