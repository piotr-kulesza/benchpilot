// ─────────────────────────────────────────────────────────────────────────
// materials.js — the instrument material library, ported from the demo's PBR
// palette (`matPainted`, `matBrushed`, `matAnodized`, `matRubber`, …).
//
// Art direction (see prompts/master-3d-scene-generator.md): instrument BODIES
// stay realistic light-grey; colour comes from liquids, caps and reagents — not
// from the machine shells. These are plain prop objects spread onto an r3f
// <meshStandardMaterial {...MAT.brushed} />, so the library stays declarative and
// carries no three.js import of its own.
// ─────────────────────────────────────────────────────────────────────────

export const MAT = {
  // painted instrument shells — dove-grey upper bodies, graphite fascia
  shellLight: { color: '#b0b8c2', metalness: 0.15, roughness: 0.46 },
  shellDark: { color: '#272d36', metalness: 0.15, roughness: 0.5 },
  // brushed steel / rotor / bright metal that catches the key light
  brushed: { color: '#9ba6b2', metalness: 0.85, roughness: 0.36 },
  brushedDark: { color: '#707a86', metalness: 0.8, roughness: 0.4 },
  steel: { color: '#c4cbd4', metalness: 0.82, roughness: 0.4 },
  // anodized aluminium (thermoblock body + machined bevels)
  anodized: { color: '#30343b', metalness: 0.72, roughness: 0.44 },
  anodizedDark: { color: '#24272d', metalness: 0.7, roughness: 0.5 },
  bevel: { color: '#c0cad4', metalness: 0.72, roughness: 0.34 },
  wellRim: { color: '#8b95a1', metalness: 0.7, roughness: 0.44 },
  bore: { color: '#1d232b', metalness: 0.4, roughness: 0.7 },
  // matte moulded plastic (caps, small parts) + soft silicone
  plasticDark: { color: '#2b323b', metalness: 0.03, roughness: 0.62 },
  rubber: { color: '#161a20', metalness: 0, roughness: 0.92 },
  // deep bowl / vent interiors — near-black, low reflect
  cavity: { color: '#15191f', metalness: 0.4, roughness: 0.72 },
}

// Restrained accent colours (status LEDs, trim). Kept sparse per art direction.
export const ACCENT = {
  led: '#3ad884',
  ledEmissive: '#2fbf6f',
  button: '#3f7fd0',
  trimTeal: '#2fa898',
}

// Glass — a light physical material (transmission, NOT the heavier
// MeshTransmissionMaterial) so a gallery of many vessels stays cheap while the
// silhouette + rim still read as clean lab borosilicate.
export const GLASS = {
  color: '#eef4f6',
  metalness: 0,
  roughness: 0.08,
  transmission: 0.92,
  thickness: 0.3,
  ior: 1.5,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  transparent: true,
  opacity: 0.5,
  envMapIntensity: 1.1,
}

// Frosted polypropylene (spin-column cup, waste) — translucent, matte.
export const FROSTED = {
  color: '#e2e9f0',
  metalness: 0,
  roughness: 0.6,
  transmission: 0.3,
  thickness: 0.4,
  transparent: true,
  opacity: 0.7,
  envMapIntensity: 0.7,
}

// Liquid — opaque, gently emissive so the fill level reads through the wall.
export function liquidProps(color) {
  return {
    color,
    metalness: 0,
    roughness: 0.32,
    emissive: color,
    emissiveIntensity: 0.14,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.6,
  }
}
