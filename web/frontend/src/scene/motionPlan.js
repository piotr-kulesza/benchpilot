// motionPlan.js — ONE TEMPO FOR THE WHOLE SCENE: one top speed and one set of minimum durations, the
// same for every station and every protocol.
//
// Every moving thing — the pipette (its descents too), vessels and their trips between stations, caps,
// lids, doors, trays and the camera (the rotor's spin and what rides in it excepted) — moves a segment
// of length d on an easing curve whose peak speed is `peak` × its average in
//     max(peak · d / MAX_SPEED, MIN_DUR[kind])
// seconds of SCENE time (dt / ANIMATION_TEMPO, scene/tempo.js; on screen the top speed is
// MAX_SPEED / tempo). Nothing is timed from its own station any more: the pipette used to be held to
// THAT pass's descent, so one station's pipette moved at 2.5 u/s and another's at 9.9.
//
// MAX_SPEED: the median of the pipette's descents as measured on the 9 bundled protocols before this
// rule (scripts/pipette-speed.mjs, on screen × tempo).
export const MAX_SPEED = 8.7            // world units per second of scene time
export const CAMERA_MAX_SPEED = MAX_SPEED
// the shortest any one segment of a kind may last (seconds of scene time): a short move still reads
// as a move, a draw or a dispense as a pause — the same everywhere
export const MIN_DUR = { move: 0.45, descent: 0.45, lift: 0.35, pause: 0.8 }
// peak speed ÷ average speed of the easing curves the scene uses
export const PEAK = { easeInOut: 3, smootherstep: 1.875, smoothstep: 1.5, linear: 1 }
// how long a move of `dist` on that curve takes so that it peaks at `vmax`
export function durationFor(dist, peak = PEAK.easeInOut, vmax = MAX_SPEED) { return peak * Math.abs(dist) / vmax }
// a segment of one kind: its distance at the top speed, never shorter than the kind's minimum
export function segmentSeconds(kind, dist = 0, peak = PEAK.easeInOut) {
  return Math.max(kind === 'pause' ? 0 : durationFor(dist, peak), MIN_DUR[kind] || 0)
}
// ONE PIPETTE PASS (demoScene's pipetteRun), segment by segment — home → over the source · into it ·
// draw (two parts) · out of it · carry · descent into the vessel · dispense · lift · home — each timed
// from its own way: d = { toSrc, down, up, carry, descent, lift, home } (world units). `drawn`: the
// pass draws a stated volume (it holds at the bottom of the source); without one the demo's path
// goes down and draws while rising (the source's legs are then two halves of one curve each).
export const PASS_KINDS = ['move', 'descent', 'pause', 'pause', 'lift', 'move', 'descent', 'pause', 'lift', 'move']
export function passSeconds(d, drawn = true) {
  const head = drawn
    ? [segmentSeconds('move', d.toSrc), segmentSeconds('descent', d.down), MIN_DUR.pause / 2, MIN_DUR.pause / 2, segmentSeconds('lift', d.up)]
    : (() => { const dn = segmentSeconds('descent', d.down) / 2, up = segmentSeconds('lift', d.up) / 2; return [segmentSeconds('move', d.toSrc), dn, dn, up, up] })()
  return [...head, segmentSeconds('move', d.carry), segmentSeconds('descent', d.descent), MIN_DUR.pause, segmentSeconds('lift', d.lift), segmentSeconds('move', d.home)]
}
// how far apart a set of speeds is: max / min − 1 (0 for none)
export function spread(xs) {
  const v = xs.filter((x) => x > 0)
  return v.length ? Math.max(...v) / Math.min(...v) - 1 : 0
}
