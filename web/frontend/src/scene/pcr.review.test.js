// PCR REVIEW, ROUND 2 — the five by-eye defects as checks on the stations the runner builds
// (stationAudit.withStation: configured, framed and driven exactly as the runner does).
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Vector3, Raycaster, DoubleSide } from 'three'
import { installHeadless } from './headless.js'
installHeadless()

const PCR = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'protocols', 'pcr.json'), 'utf8'))
let withStation, projectedArea, isOpaque, stationVisTarget, SPACING
beforeAll(async () => {
  ;({ withStation } = await import('./stationAudit.js'))
  ;({ projectedArea, isOpaque } = await import('./visibilityAudit.js'))
  ;({ stationVisTarget } = await import('../vessel/StationScene.jsx'))
  SPACING = 8.4
}, 60000)

const POSES = [0, 0.25, 0.54, 0.75, 1]
const verts = (m) => { m.updateWorldMatrix(true, false); const a = m.geometry.attributes.position, o = []; for (let i = 0; i < a.count; i++) o.push(new Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld)); return o }
const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }
const meshesOf = (root, pred) => { const o = []; root.traverse((m) => { if (m.isMesh && pred(m)) o.push(m) }); return o }
// fraction of `pts` (in frame) hidden from the camera behind any of `occ`
function hiddenFraction(cam, pts, occ) {
  const inFrame = pts.filter((p) => { const q = p.clone().project(cam); return Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1 })
  if (!inFrame.length) return 1
  const saved = occ.map((o) => [o.material, o.material.side]); occ.forEach((o) => { o.material.side = DoubleSide })
  const ray = new Raycaster(); let hid = 0
  for (const p of inFrame) { const d = p.distanceTo(cam.position); ray.set(cam.position, p.clone().sub(cam.position).normalize()); ray.far = d - 1e-3; if (ray.intersectObjects(occ, false).length) hid++ }
  saved.forEach(([m, s]) => { m.side = s })
  return hid / inFrame.length
}

describe('PCR 5–7 · nothing outside the current station is in frame', () => {
  it('once the dolly arrives at a three-quarter-view station, every other station is faded out', () => {
    expect(stationVisTarget(SPACING, { solo: true, active: false })).toBe(0)
    expect(stationVisTarget(0, { solo: true, active: true })).toBe(1)
  })
  it('the rail view keeps its neighbour fade (the dolly between stations shows both)', () => {
    expect(stationVisTarget(SPACING, { solo: false, active: false })).toBeGreaterThan(0.5)
  })
})

describe('PCR 4–7 · the display reads at a glance', () => {
  // the display's projected box ≥ 5 % of the frame wherever the machine is the subject (it
  // was 2.6 %); the lid stays in frame with it — one machine (closed, its skirt hides the block)
  for (const i of [3, 4, 5, 6]) {
    it(`station ${i + 1}`, () => withStation(PCR, i, (st, { cam }) => {
      const tc = st.dev || st.group.children.find((c) => c.userData.spec === 'thermocycler_96')
      const out = []
      for (const p of POSES) {
        const c = cam(p)
        if (st.subjectAt(p) !== tc) continue
        const a = projectedArea(c, verts(tc.userData.display))
        const lid = projectedArea(c, verts(tc.userData.lidMesh))
        if (a < 0.05 || lid < 0.05) out.push({ p, display: +a.toFixed(3), lid: +lid.toFixed(3) })
      }
      expect(out).toEqual([])
    }))
  }
})

describe('PCR 3 · the balance tube is seen at rest', () => {
  it('at start and end, neither the sample nor its counterweight is hidden behind the rotor hub', () => withStation(PCR, 2, (st, { cam, S }) => {
    const out = []
    for (const p of [0, 1]) {
      const c = cam(p)
      const bal = []; st.group.traverse((o) => { if (o.userData.balance) bal.push(o) })
      const sample = S.vessels.find((v) => v.visible && v.userData.spec === 'pcr_tube_0_2')
      for (const v of [bal[0], sample]) {
        const occ = [...meshesOf(st.group, (m) => shown(m) && isOpaque(m))].filter((m) => { for (let n = m; n; n = n.parent) if (n === v) return false; return true })
        const pts = meshesOf(v, (m) => shown(m) && !m.userData.fx).flatMap(verts)
        const f = hiddenFraction(c, pts, occ)
        if (f > 0.25) out.push({ p, tube: v.userData.balance ? 'balance' : 'sample', hidden: +f.toFixed(2) })
      }
    }
    expect(out).toEqual([])
  }))
})

describe('PCR 8 · the leads come with the lid', () => {
  it('while the lid is off the tank, no lead is shown; with the lid on, both are', () => withStation(PCR, 7, (st, { cam }) => {
    const leads = meshesOf(st.group, (m) => m.userData.fx === 'cable')
    expect(leads.length).toBe(2)
    cam(0); expect(leads.filter(shown).length).toBe(0)           // lid off, set aside: loading
    cam(0.54); expect(leads.filter(shown).length).toBe(0)
    cam(1); expect(leads.filter(shown).length).toBe(2)           // the run: the lid is on
  }))
})

describe('PCR 1 · crushed ice round the block, in frame, clear of the tube', () => {
  // ≥ 40 pieces in frame and SEEN (not behind the pan wall or the rack), some of them in
  // front of the tube (round the block, not only at the frame's edge) — and not one piece
  // between the camera and the reaction tube
  it('ice is in frame and seen at every pose; none of it covers the reaction tube', () => withStation(PCR, 0, (st, { cam, S }) => {
    const out = []
    for (const p of POSES) {
      const c = cam(p)
      const ice = meshesOf(st.group, (m) => m.userData.fx === 'granular' && shown(m))
      const walls = meshesOf(st.group, (m) => shown(m) && !m.userData.fx && isOpaque(m))
      const tube = S.vessels.find((v) => v.visible && v.userData.spec === 'pcr_tube_0_2')
      const tz = tube.getWorldPosition(new Vector3()).z
      // a piece is seen if its crest is (a crushed-ice bed shows its tops)
      const crest = (m) => verts(m).reduce((a, b) => (b.y > a.y ? b : a))
      const seen = ice.filter((m) => { const w = crest(m), q = w.clone().project(c); return Math.abs(q.x) <= 0.95 && Math.abs(q.y) <= 0.95 && hiddenFraction(c, [w], walls) === 0 })
      const front = seen.filter((m) => m.getWorldPosition(new Vector3()).z > tz).length
      const covered = hiddenFraction(c, meshesOf(tube, (m) => shown(m) && !m.userData.fx).flatMap(verts), ice)
      if (seen.length < 40 || front < 15 || covered > 0) out.push({ p, seen: seen.length, front, covered: +covered.toFixed(3) })
    }
    expect(out).toEqual([])
  }))
})
