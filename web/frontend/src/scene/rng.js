// rng.js — per-builder seeded random streams (pure; no three.js, no DOM).
//
// Every builder in demoScene.js used to draw from ONE shared Math.random stream, so a
// builder that took one extra random value shifted every later builder's draws: ice
// cubes, heat bubbles and detached cells moved in tiles no change had touched, and a
// before/after diff had a noise floor. Now each builder runs on its own stream, seeded
// from (base seed, builder name, how many times that builder has been called). The base
// seed is taken ONCE from the ambient Math.random — in the capture harness that is the
// per-tile seed, so a tile stays reproducible; in the app it is random, as before.

// FNV-1a 32-bit
function hash(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// `baseSeed()` is called once, lazily, on the first wrapped call.
export function createRngStreams(baseSeed = () => (Math.random() * 4294967296) >>> 0) {
  let base = null
  const calls = new Map()
  return {
    wrap(name, fn) {
      return function wrapped(...args) {
        if (base == null) base = baseSeed() >>> 0
        const k = (calls.get(name) || 0) + 1
        calls.set(name, k)
        const saved = Math.random
        Math.random = mulberry32((base ^ hash(`${name}#${k}`)) >>> 0)
        try { return fn.apply(this, args) } finally { Math.random = saved }
      }
    },
  }
}

// The one shared instance: every wrapped builder and scene step draws its base seed from
// here, so the base is taken from the ambient stream exactly once per page.
export const streams = createRngStreams()
