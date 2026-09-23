// determinism.mjs — make a headless capture reproducible, so a baseline → current diff
// has NO noise floor. Noise is where a real regression hides: a tile that changes on
// every run trains the reviewer to dismiss changes ("probably the rotor").
//
// Two sources of run-to-run variation in a rendered scene, both removed here:
//   • Math.random — ice-cube placement, heat bubbles, bench/brushed-metal grain,
//     liquid phase. Replaced by a seeded PRNG (mulberry32). The seed is derived from
//     the TILE NAME, so each tile is reproducible while different tiles still vary.
//   • wall-clock time — anything integrated over frame dt (the centrifuge rotor turns
//     by spin*dt; eased timelines lerp by dt). performance.now advances by exactly
//     1/60 s per animation frame, and the page FREEZES after a fixed frame count, so a
//     screenshot shows the state after N frames — not after however many frames the
//     machine happened to render in a wall-clock sleep.
//
// Usage (puppeteer):
//   const d = await deterministic(page, 'matrix/centrifuge__microtube__p09.png', 900)
//   await page.goto(url); await d.settled(); await page.screenshot(...); await d.dispose()

// FNV-1a 32-bit — tile name → seed. Pure; exported for tests / reuse.
export function seedFromName(name) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

// Runs IN THE PAGE before any app code (evaluateOnNewDocument). Self-contained.
function install(seed, frames) {
  let a = seed >>> 0
  Math.random = function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  // fixed-step clock: time only moves when a frame is delivered
  let now = 0
  performance.now = () => now
  // Batch every rAF callback into ONE real frame, so several loops (R3F, React, the
  // app's own) still advance the clock once per frame, not once per loop.
  const realRAF = window.requestAnimationFrame.bind(window)
  let queue = []
  let nextId = 0
  let scheduled = false
  window.__bpFrames = 0
  window.__bpFrameLimit = frames
  function tick() {
    scheduled = false
    if (window.__bpFrames >= window.__bpFrameLimit) return // frozen: hold the last frame
    now += 1000 / 60
    window.__bpFrames++
    const q = queue
    queue = []
    for (const [, cb] of q) cb(now)
    if (queue.length && !scheduled) { scheduled = true; realRAF(tick) }
  }
  window.requestAnimationFrame = (cb) => {
    const id = ++nextId
    queue.push([id, cb])
    if (!scheduled) { scheduled = true; realRAF(tick) }
    return id
  }
  window.cancelAnimationFrame = (id) => { queue = queue.filter((q) => q[0] !== id) }
}

// Install for the NEXT navigation of `page`. `settleMs` is the simulated time the tile
// should run before capture (frames = settleMs at 60 Hz).
export async function deterministic(page, name, settleMs) {
  const frames = Math.max(1, Math.round((settleMs / 1000) * 60))
  const { identifier } = await page.evaluateOnNewDocument(install, seedFromName(name), frames)
  return {
    frames,
    // wait until the page has rendered exactly `frames` frames and frozen
    async settled(timeoutMs = Math.max(20000, settleMs * 6)) {
      await page.waitForFunction((n) => window.__bpFrames >= n, { timeout: timeoutMs, polling: 50 }, frames)
      await new Promise((r) => setTimeout(r, 120)) // let the compositor present the frozen frame
    },
    async dispose() { await page.removeScriptToEvaluateOnNewDocument(identifier) },
  }
}
