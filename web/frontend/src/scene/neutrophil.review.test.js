// NEUTROPHIL REVIEW — the by-eye defects of the featured demo protocol, as checks on the
// stations the runner builds (stationAudit.withStation: configured, framed and driven exactly
// as the runner does). Station numbers are the runner's (1-based).
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Vector3, Box3, Matrix4, Raycaster, DoubleSide } from 'three'
import { installHeadless } from './headless.js'
installHeadless()

const RNA = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'protocols', 'neutrophil_rna.json'), 'utf8'))
const PCR = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'protocols', 'pcr.json'), 'utf8'))
let withStation, isOpaque, resolveRecipe, stepConditions, line, pcrLine
beforeAll(async () => {
  ;({ withStation } = await import('./stationAudit.js'))
  ;({ isOpaque } = await import('./visibilityAudit.js'))
  ;({ resolveRecipe, stepConditions } = await import('../vessel/sceneRecipe.js'))
  const { partitionSteps } = await import('../lib/runtime.js')
  line = { ...RNA, steps: partitionSteps(RNA.steps).stations }   // the runner builds the line from the stations
  pcrLine = { ...PCR, steps: partitionSteps(PCR.steps).stations }
}, 60000)
const at = (n, fn) => withStation(line, n - 1, fn)

const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }
const meshesOf = (root, pred) => { const o = []; root.traverse((m) => { if (m.isMesh && pred(m)) o.push(m) }); return o }
const specOf = (st, id) => { let f = null; st.group.traverse((n) => { if (!f && n.userData?.spec === id) f = n }); return f }
const verts = (m) => { m.updateWorldMatrix(true, false); const a = m.geometry.attributes.position, o = []; for (let i = 0; i < a.count; i++) o.push(new Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld)); return o }
const ndc = (c, p) => p.clone().project(c)
const inFrame = (c, p, m = 1) => { const q = ndc(c, p); return Math.abs(q.x) <= m && Math.abs(q.y) <= m && q.z < 1 }
function hiddenFraction(cam, pts, occ) {
  const pin = pts.filter((p) => inFrame(cam, p))
  if (!pin.length) return 1
  const saved = occ.map((o) => [o.material, o.material.side]); occ.forEach((o) => { o.material.side = DoubleSide })
  const ray = new Raycaster(); let hid = 0
  for (const p of pin) { const d = p.distanceTo(cam.position); ray.set(cam.position, p.clone().sub(cam.position).normalize()); ray.far = d - 1e-3; if (ray.intersectObjects(occ, false).length) hid++ }
  saved.forEach(([m, s]) => { m.side = s })
  return hid / pin.length
}
// ice pieces, plain or instanced: each piece's world matrix and its size (max extent)
function icePieces(root) {
  const out = []
  for (const m of meshesOf(root, (x) => x.userData.fx === 'granular' && !x.userData.iceBed && shown(x))) {   // pieces (not the packed bed under them)
    m.updateWorldMatrix(true, false)
    const g = m.geometry; g.computeBoundingBox(); const gs = g.boundingBox.getSize(new Vector3())
    const mats = []
    if (m.isInstancedMesh) { for (let k = 0; k < m.count; k++) { const im = new Matrix4(); m.getMatrixAt(k, im); mats.push(im.premultiply(m.matrixWorld)) } } else mats.push(m.matrixWorld)
    for (const M of mats) { const s = new Vector3().setFromMatrixScale(M); out.push({ size: Math.max(gs.x * s.x, gs.y * s.y, gs.z * s.z), centre: new Vector3().setFromMatrixPosition(M), top: new Vector3().setFromMatrixPosition(M).y + gs.y * s.y / 2 }) }
  }
  return out
}
// the volume (µL) of a vessel's liquid as drawn: the closed lathe's signed volume (1 world unit³ = 10⁶ µL)
function liquidMicroliters(v) {
  const liq = v.userData.liq; if (!liq || !liq.visible) return 0
  liq.updateWorldMatrix(true, false)
  const g = liq.geometry.index ? liq.geometry.toNonIndexed() : liq.geometry, a = g.attributes.position
  let vol = 0; const p = new Vector3(), q = new Vector3(), r = new Vector3()
  for (let i = 0; i < a.count; i += 3) { p.fromBufferAttribute(a, i).applyMatrix4(liq.matrixWorld); q.fromBufferAttribute(a, i + 1).applyMatrix4(liq.matrixWorld); r.fromBufferAttribute(a, i + 2).applyMatrix4(liq.matrixWorld); vol += p.dot(q.clone().cross(r)) / 6 }
  return Math.abs(vol) * 1e6
}
const settle = (st, S) => { for (let k = 0; k < 40; k++) { for (const u of st.updatables) u.userData?.update?.(1); for (const v of S.vessels) v.userData?.update?.(1); for (const v of [st.prep].filter(Boolean)) v.userData?.update?.(1) } }

describe('1 · ICE — crushed ice round a tube that sits down in it, seen from above (stations 1, 23, 24)', () => {
  for (const [n, p] of [[1, 0], [1, 0.54], [1, 1], [23, 1], [24, 0]]) {
    it(`station ${n} p=${p}`, () => at(n, (st, { cam, S }) => {
      const c = cam(p)
      const tube = S.vessels.find((v) => v.visible && v.userData.spec === 'microtube_1_5')
      const tb = new Box3().setFromObject(tube.userData.visual || tube), TD = tb.max.y - tb.min.y, tubeD = tb.max.x - tb.min.x
      const ice = icePieces(st.group)
      const big = ice.filter((k) => k.size > tubeD * 0.6).length                 // pieces small relative to the tube
      const iceTop = Math.max(...ice.filter((k) => k.centre.distanceTo(tube.getWorldPosition(new Vector3())) < 0.4).map((k) => k.top))
      const sunk = iceTop > tb.min.y                                             // its tip is down in the ice…
      const upper = (tb.max.y - iceTop) / TD                                      // …and its upper part stands clear
      const liq = tube.userData.liq
      const others = meshesOf(st.group, (m) => shown(m) && isOpaque(m) && !tube.children.includes(m))
      const iceMeshes = meshesOf(st.group, (m) => m.userData.fx === 'granular' && shown(m))
      const liqHidden = liq && liq.visible ? hiddenFraction(c, verts(liq), [...others, ...iceMeshes]) : 1
      const down = Math.asin((c.position.y - tube.getWorldPosition(new Vector3()).y) / c.position.distanceTo(tube.getWorldPosition(new Vector3()))) * 180 / Math.PI
      expect({ big, sunk, upperOk: upper >= 0.5, liqHidden: +liqHidden.toFixed(2) <= 0.25, lookingDown: down >= 35 })
        .toEqual({ big: 0, sunk: true, upperOk: true, liqHidden: true, lookingDown: true })
    }))
  }
})

describe('2 · station 3 "Homogenize the lysate" names no instrument — the bench', () => {
  it('no centrifuge is built', () => at(3, (st) => { expect(specOf(st, 'microcentrifuge')).toBe(null) }))
  it('a centrifuge step that states a spin keeps its centrifuge', () => {
    const s = { action: 'centrifuge', text_en: 'Centrifuge 15 s, discard the flow-through.' }
    expect(resolveRecipe(s.action, { container: 'spin_column', conditions: stepConditions(s), step: s }).equipment).toBe('centrifuge')
  })
})

describe('3 · the centrifuge display shows the stated time (and speed); PULSE only for an untimed spin', () => {
  const read = (n, p, l = line) => withStation(l, n - 1, (st, { cam }) => { cam(p); const cen = specOf(st, 'microcentrifuge'); return cen.userData.readout() })
  it('station 8 (15 s): counts down 15 s while it spins', () => {
    expect(read(8, 0.05)).toMatchObject({ mode: 'time', seconds: 15, rcf: null })
    const mid = read(8, 0.49); expect(mid.mode).toBe('time'); expect(mid.left).toBeGreaterThan(0); expect(mid.left).toBeLessThan(15)
  })
  it('station 6 (15 s at ≥ 8000 × g) shows both', () => { expect(read(6, 0.5)).toMatchObject({ mode: 'time', seconds: 15, rcf: 8000 }) })
  it('station 17 (2 min) and 22 (1 min at ≥ 8000 × g)', () => {
    expect(read(17, 0.5)).toMatchObject({ mode: 'time', seconds: 120 })
    expect(read(22, 0.5)).toMatchObject({ mode: 'time', seconds: 60, rcf: 8000 })
  })
  it('PCR 3 ("briefly spin down", no time) stays PULSE', () => { expect(read(3, 0.5, pcrLine)).toMatchObject({ mode: 'pulse' }) })
})

describe('4 · liquid follows the stated volume', () => {
  const vol = (n, p) => at(n, (st, { cam, S }) => { cam(p); settle(st, S); const v = S.vessels.find((x) => x.visible && x.userData.liq?.visible); return { spec: v?.userData.spec, ul: v ? liquidMicroliters(v) : 0 } })
  for (const n of [22, 23, 24, 25, 26]) {
    it(`station ${n}: the eluate is 30 µL (30–50 µL, the lower bound)`, () => { const r = vol(n, 1); expect(r.spec).toBe('microtube_1_5'); expect(r.ul).toBeGreaterThan(25); expect(r.ul).toBeLessThan(36) })
  }
  it('station 7: the column holds 350 µL of RW1 at the end', () => { const r = vol(7, 1); expect(r.ul).toBeGreaterThan(300); expect(r.ul).toBeLessThan(400) })
  it('station 9: the DNase mix is 80 µL (10 + 70)', () => at(9, (st, { cam, S }) => { cam(1); settle(st, S); const ul = liquidMicroliters(st.prep); expect(ul).toBeGreaterThan(68); expect(ul).toBeLessThan(92) }))
})

describe('5 · nothing floats or vanishes', () => {
  it('station 18 middle: the column is seated, not hanging in the air', () => at(18, (st, { cam, S }) => {
    cam(0.54); const col = S.vessels.find((v) => v.visible && v.userData.spec === 'spin_column_mini')
    expect(!!col.userData.placement && !col.userData.held).toBe(true)
  }))
  it('station 5: the emptied source tube stays where it was', () => at(5, (st, { cam, S }) => {
    cam(0); const tube = S.vessels.find((v) => v.visible && v.userData.spec === 'microtube_1_5'); const x0 = tube.position.x
    cam(1); expect(tube.visible).toBe(true); expect(Math.abs(tube.position.x - x0)).toBeLessThan(1e-6)
  }))
  // (at its level cruise the tip is at the frame's top edge — CLAUDE.md: framing the cruise
  // whole would shrink the tube; the pipette is seen coming down into the column and dispensing)
  it('station 5: the pipette carrying the sample is in frame as it brings it down into the column', () => at(5, (st, { cam }) => {
    const out = []
    for (const p of [0.45, 0.54, 0.6]) { const c = cam(p); if (!inFrame(c, st.pip.getWorldPosition(new Vector3()), 0.98)) out.push(p) }
    expect(out).toEqual([])
  }))
})

describe('6 · the dispense into the column is seen (add-buffer stations)', () => {
  for (const n of [7, 10, 12, 14, 16, 20]) {
    it(`station ${n}: at the middle pose the tip is in the column's mouth, and in frame with half its cone`, () => at(n, (st, { cam, S }) => {
      const c = cam(0.54)
      const col = S.vessels.find((v) => v.visible && v.userData.spec === 'spin_column_mini')
      const tip = st.pip.getWorldPosition(new Vector3()), mouthY = col.getWorldPosition(new Vector3()).y + col.userData.mouth.y
      expect({ inMouth: tip.y <= mouthY, tip: inFrame(c, tip, 0.98), cone: inFrame(c, tip.clone().add(new Vector3(0, 0.026, 0)), 0.98) })
        .toEqual({ inMouth: true, tip: true, cone: true })
    }))
  }
})

describe('7 · no countdown ring on the bench (the timer lives in the HUD)', () => {
  it('the line builds no bench dial', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'vessel', 'StationScene.jsx'), 'utf8')
    expect(src.includes('makeBenchDial(')).toBe(false)
  })
})

describe('8 · the NanoDrop reads as an instrument, and the sample is applied', () => {
  it('station 24: the NanoDrop is whole in frame while it reads', () => at(24, (st, { cam }) => {
    const nano = specOf(st, 'nanodrop'); const out = []
    for (const p of [0.54, 0.75, 1]) { const c = cam(p); const b = new Box3().setFromObject(nano); const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)); if (!corners.every((q) => inFrame(c, q, 1))) out.push(p) }
    expect(out).toEqual([])
  }))
  it('station 24: the pipette puts a drop on the pedestal, and the reading follows it', () => at(24, (st, { cam }) => {
    const nano = specOf(st, 'nanodrop')
    let touched = false
    for (let k = 0; k <= 40; k++) { cam(k / 40); const d = st.pip?.getWorldPosition(new Vector3()).distanceTo(nano.userData.pedestalTop()); if (d != null && d < 0.02) touched = true }
    cam(1)
    expect({ touched, drop: !!nano.userData.drop && shown(nano.userData.drop), reading: nano.userData.st.tProg > 0.9 }).toEqual({ touched: true, drop: true, reading: true })
  }))
})

describe('9 · station 23 start: nothing cropped into the frame edge', () => {
  // the grey shape at the left edge was the station's OWN ice bucket, cropped by the frame on
  // the tube in its stand: every object of the station is wholly in frame or wholly out
  it('every object of the station is wholly in or wholly out of the frame at the start', () => at(23, (st, { cam }) => {
    const c = cam(0), cropped = []
    for (const o of st.group.children) {
      if (!o.userData?.spec || !shown(o) || o.userData.offBench) continue
      // its drawn vertices in front of the camera: some in frame and some out = cropped
      const pts = meshesOf(o, (m) => shown(m) && !m.isInstancedMesh).flatMap(verts).map((p) => p.clone().applyMatrix4(c.matrixWorldInverse)).filter((p) => p.z < 0).map((p) => p.applyMatrix4(c.projectionMatrix))
      const inside = pts.filter((q) => Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1).length
      if (inside > 0 && inside < pts.length) cropped.push(o.userData.spec)
    }
    expect(cropped).toEqual([])
  }))
})
