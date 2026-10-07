// motionPlan.js — THE SHARED MOTION RULE: how fast anything in the scene may move.
//
// Every moving object (pipettes, tubes, columns, caps, lids, plates, flasks, the centrifuge lid —
// the rotor's spin excepted) is timed from its own DISTANCE, against ONE global top speed: a
// segment of length d on an easing curve whose peak speed is `peak` × its average lasts
// peak · d / MAX_SPEED. Nothing is a fixed share of a step any more. All of it is SCENE time
// (dt / ANIMATION_TEMPO, scene/tempo.js); on screen the top speed is MAX_SPEED / tempo.
//
// MAX_SPEED is the pipette's descent into the vessel as it was approved on neutrophil_rna ("Add RLT
// buffer": 5.9 u/s on screen at tempo 1.6 = 9.4 u/s of scene time). The camera's own cap is the
// glide it always had: one station spacing (8.4) in 1.65 s on the cubic ease — 15.3 u/s.
export const MAX_SPEED = 9.4            // world units per second of scene time
export const CAMERA_MAX_SPEED = 15.3    // the camera's glide, same kind of cap
// peak speed ÷ average speed of the easing curves the scene uses
export const PEAK = { easeInOut: 3, smootherstep: 1.875, smoothstep: 1.5, linear: 1 }
// how long a move of `dist` on that curve takes so that it peaks at `vmax`
export function durationFor(dist, peak = PEAK.easeInOut, vmax = MAX_SPEED) { return peak * Math.abs(dist) / vmax }
