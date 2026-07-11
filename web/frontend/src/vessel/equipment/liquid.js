// ─────────────────────────────────────────────────────────────────────────
// liquid.js — build a liquid volume that CONFORMS to a vessel's interior.
//
// Ported from the demo's `liquidProfileGeo`: a vessel's glass is a lathe of a 2D
// profile (x = radius, y = height); its liquid must obey the SAME contour, not a
// floating cylinder. We sample the (inset) inner profile from the bottom up to
// the fill line and cap it FLAT there — wide where the vessel is wide, narrow
// where it tapers. Returns THREE.Vector2[] ready for a <latheGeometry>.
// ─────────────────────────────────────────────────────────────────────────

import { Vector2 } from 'three'

// profile: normalized [xFactor, yFactor][]; R,H: vessel radius/height;
// fill: 0..1 of the vessel height; inset: how far inside the wall the fluid sits.
export function liquidPoints(profile, R, H, fill, { inset = 0.9, bottom = 0.02 } = {}) {
  const yTop = Math.max(bottom + 0.001, fill * H)
  const radiusAt = (y) => {
    // interpolate the profile's radius (in world units) at height y
    if (y <= profile[0][1] * H) return profile[0][0] * R * inset
    for (let i = 1; i < profile.length; i++) {
      const [ax, ay] = [profile[i - 1][0] * R, profile[i - 1][1] * H]
      const [bx, by] = [profile[i][0] * R, profile[i][1] * H]
      if (y <= by) {
        const t = (y - ay) / ((by - ay) || 1)
        return (ax + (bx - ax) * t) * inset
      }
    }
    return profile[profile.length - 1][0] * R * inset
  }

  const pts = [new Vector2(0, bottom)]
  // walk up the inner wall, sampling profile vertices below the fill line
  for (const [xf, yf] of profile) {
    const y = yf * H
    if (y <= bottom) continue
    if (y >= yTop) break
    pts.push(new Vector2(xf * R * inset, y))
  }
  pts.push(new Vector2(radiusAt(yTop), yTop)) // fill line at the wall
  pts.push(new Vector2(0, yTop)) // flat top back to the axis
  return pts
}
