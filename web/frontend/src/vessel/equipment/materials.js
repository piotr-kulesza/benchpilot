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

import { theme } from '../theme.js'

// Metals carry a raised envMapIntensity + lower roughness so the bright key
// softbox reads as a SHARP specular hotspot (dull instruments = cheap look).
export const MAT = {
  // painted instrument shells — dove-grey upper bodies, graphite fascia
  shellLight: { color: '#b0b8c2', metalness: 0.2, roughness: 0.4, envMapIntensity: 1.15 },
  shellDark: { color: '#272d36', metalness: 0.2, roughness: 0.44, envMapIntensity: 1.1 },
  // brushed steel / rotor / bright metal that catches the key light
  brushed: { color: '#9ba6b2', metalness: 0.9, roughness: 0.26, envMapIntensity: 1.4 },
  brushedDark: { color: '#707a86', metalness: 0.85, roughness: 0.32, envMapIntensity: 1.3 },
  steel: { color: '#c4cbd4', metalness: 0.88, roughness: 0.28, envMapIntensity: 1.4 },
  // anodized aluminium (thermoblock body + machined bevels)
  anodized: { color: '#30343b', metalness: 0.78, roughness: 0.36, envMapIntensity: 1.25 },
  anodizedDark: { color: '#24272d', metalness: 0.75, roughness: 0.42, envMapIntensity: 1.15 },
  bevel: { color: '#c0cad4', metalness: 0.78, roughness: 0.26, envMapIntensity: 1.4 },
  wellRim: { color: '#8b95a1', metalness: 0.78, roughness: 0.34, envMapIntensity: 1.3 },
  bore: { color: '#1d232b', metalness: 0.4, roughness: 0.68, envMapIntensity: 0.8 },
  // matte moulded plastic (caps, small parts) + soft silicone
  plasticDark: { color: '#2b323b', metalness: 0.05, roughness: 0.5, envMapIntensity: 0.9 },
  rubber: { color: '#161a20', metalness: 0, roughness: 0.92, envMapIntensity: 0.5 },
  // deep bowl / vent interiors — near-black, low reflect
  cavity: { color: '#15191f', metalness: 0.4, roughness: 0.7, envMapIntensity: 0.7 },
}

// Restrained accent colours (status LEDs, trim). Kept sparse per art direction.
export const ACCENT = {
  led: '#3ad884',
  ledEmissive: '#2fbf6f',
  button: '#3f7fd0',
  trimTeal: '#2fa898',
}

// Glass is its own component now (equipment/Glass.jsx) — one stylized physical
// material + fresnel rim (the demo's glassMaterial), read from theme.glass.

// Frosted polypropylene (spin-column cup) — translucent, matte-ish, still lit.
export function frostedProps() {
  const f = theme.frosted
  return {
    color: f.color,
    metalness: 0,
    roughness: f.roughness,
    transmission: f.transmission,
    thickness: f.thickness,
    clearcoat: f.clearcoat,
    clearcoatRoughness: f.clearcoatRoughness,
    ior: f.ior,
    envMapIntensity: f.envMapIntensity,
    transparent: true,
  }
}

// Liquid — glossy + slightly translucent so it reads as fluid, not a matte disc;
// gently emissive so the level stays legible through the glass. All knobs from
// theme.liquid.
export function liquidProps(color) {
  const l = theme.liquid
  return {
    color,
    metalness: 0,
    roughness: l.roughness,
    transmission: l.transmission,
    thickness: l.thickness,
    ior: l.ior,
    emissive: color,
    emissiveIntensity: l.emissiveIntensity,
    clearcoat: l.clearcoat,
    clearcoatRoughness: l.clearcoatRoughness,
    envMapIntensity: l.envMapIntensity,
    transparent: true,
  }
}
