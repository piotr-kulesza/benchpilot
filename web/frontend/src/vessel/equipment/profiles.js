// ─────────────────────────────────────────────────────────────────────────
// profiles.js — lathe silhouettes ported verbatim (in proportion) from the demo.
//
// Each profile is a list of [xFactor, yFactor] pairs in 0..1-ish units; a vessel
// scales them by its own radius (R) and height (H). Rounded bottoms — NO sharp
// cones — exactly as the demo settled on. `toPoints(profile, R, H)` turns a
// profile into the THREE.Vector2[] a <latheGeometry> wants.
// ─────────────────────────────────────────────────────────────────────────

import { Vector2 } from 'three'

// Conical microcentrifuge tube — rounded BELL bottom (demo buildTube `prof`).
export const TUBE_PROFILE = [
  [0.0, 0.0],
  [0.22, 0.010],
  [0.42, 0.038],
  [0.60, 0.088],
  [0.75, 0.155],
  [0.87, 0.245],
  [0.93, 0.34],
  [0.955, 0.45],
  [0.955, 0.90],
  [0.985, 0.945],
  [1.06, 0.985],
  [1.05, 1.0],
]

// RNeasy spin-column collection tube — rounded U-shaped bottom (demo `cp`).
export const COLUMN_COLLAR = [
  [0.0, 0.0],
  [0.075, 0.012],
  [0.145, 0.05],
  [0.21, 0.12],
  [0.265, 0.22],
  [0.30, 0.36],
  [0.32, 0.60],
  [0.32, 0.98],
  [0.335, 1.0],
]

// The inner column "cup" that sits inside the collection tube (demo `ip`), in
// absolute demo units (y already in world height) — used as-is, not scaled.
export const COLUMN_CUP = [
  [0.14, 0.86],
  [0.2, 0.9],
  [0.27, 1.02],
  [0.28, 1.5],
  [0.3, 1.56],
]

// Reagent bottle — wide body tapering to a narrow neck (demo `bp`, h≈1.3).
export const BOTTLE_PROFILE = [
  [0.001, 0.0],
  [0.34, 0.015],
  [0.36, 0.06],
  [0.36, 0.72],
  [0.30, 0.82],
  [0.16, 0.90],
  [0.15, 1.0],
  [0.155, 1.004],
]

// Scale a normalized profile by radius R (x) and height H (y) → Vector2[].
export function toPoints(profile, R = 1, H = 1) {
  return profile.map(([x, y]) => new Vector2(x * R, y * H))
}

// Raw [x,y] pairs (already in world units) → Vector2[].
export function rawPoints(profile) {
  return profile.map(([x, y]) => new Vector2(x, y))
}
