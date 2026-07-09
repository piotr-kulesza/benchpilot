// Smooth solid-of-revolution profiles for the glass vessel and its liquid.
// Kept out of the component so the silhouette can be tuned in one place and so
// the arrays are memoized once (light geometry = 60fps).

import { Vector2 } from 'three'

function arc(cx, cy, r, a0, a1, n) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n)
    pts.push(new Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)))
  }
  return pts
}

const D = Math.PI / 180
const V = (x, y) => new Vector2(x, y)

// A HOLLOW, open-top lab vial: thin glass walls with a rounded bottom, so the
// coloured liquid inside reads clearly (a solid glass block hides its contents).
// The profile is a closed loop revolved around Y: down the outside, around the
// outer bottom, back up the inside, then a rim lip across the top.
const Ro = 0.6 // outer radius
const Ri = 0.47 // inner radius (wall ≈ 0.13)

export const VIAL_PROFILE = [
  V(Ro, 1.0), // outer rim
  V(Ro, -0.5), // outer wall down
  ...arc(0, -0.5, Ro, 0 * D, -90 * D, 14), // outer bottom → (0,-1.1)
  ...arc(0, -0.42, Ri, -90 * D, 0 * D, 14), // inner bottom → (Ri,-0.42)
  V(Ri, 1.0), // inner wall up
  V(Ro, 1.0), // rim lip (close loop)
]

// The liquid sits within the inner cavity, visible through the open top.
export const INNER = {
  radius: 0.46,
  bottom: -0.88,
  top: 0.92,
}
INNER.height = INNER.top - INNER.bottom
