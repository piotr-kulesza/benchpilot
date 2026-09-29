// headless.js — just enough DOM for the demo builders to run in Node (Vitest, the
// geometry audit script). The builders paint labels, dials and textures onto 2D canvases;
// geometry never depends on those pixels, so a canvas whose context records nothing is
// sufficient. measureText returns a width proportional to the string so a label still
// sizes itself (labels are sprites and never enter a geometry check).
//
// Install ONCE before importing demoScene.js / StationScene.jsx:
//   import { installHeadless } from './headless.js'; installHeadless()

function fakeContext() {
  const noop = () => {}
  const grad = { addColorStop: noop }
  return new Proxy({}, {
    get(_t, k) {
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 10 })
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
      return noop
    },
    set() { return true },
  })
}

export function installHeadless() {
  if (typeof globalThis.document !== 'undefined') return
  const makeCanvas = () => ({ width: 1, height: 1, style: {}, getContext: () => fakeContext(), addEventListener() {} })
  globalThis.document = { createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {} }), createElementNS: () => makeCanvas() }
  if (typeof globalThis.performance === 'undefined') globalThis.performance = { now: () => 0 }
}
