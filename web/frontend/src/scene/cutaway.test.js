// CUTAWAY REMOVES A WALL, NOT THE SCENE (CLAUDE.md "Cutaway"). For every model that declares
// a cutaway, setCutaway(true) may change ONLY the near wall — the meshes on the camera side
// (+z) of the enclosure. Never the back or side walls (the backdrop the subject is read
// against), never a liquid (the water must still read as water), never the subject.
import { describe, it, expect, beforeAll } from 'vitest'
import { Box3, Vector3 } from 'three'
import { installHeadless } from './headless.js'
installHeadless()

let MODELS, demo, solidBox, placeInto
beforeAll(async () => {
  demo = await import('./demoScene.js')
  ;({ MODELS } = await import('../dev/registry.js'))
  ;({ solidBox } = await import('./solids.js'))
  ;({ placeInto } = await import('./sockets.js'))
  demo.buildSharedMaps()
})

const matsOf = (m) => (Array.isArray(m.material) ? m.material : [m.material])
function snapshot(root) {
  const s = new Map()
  root.traverse((o) => { if (o.isMesh || o.isSprite) s.set(o, matsOf(o).map((x) => ({ m: x, o: x.opacity, t: x.transparent }))) })
  return s
}
function changed(root, before) {
  const out = []
  root.traverse((o) => {
    const b = before.get(o); if (!b) return
    const now = matsOf(o)
    if (now.some((x, i) => !b[i] || x !== b[i].m || x.opacity !== b[i].o || x.transparent !== b[i].t)) out.push(o)
  })
  return out
}
const NEAR_EPS = 1e-3
function nearWallDefects(id) {
  const host = MODELS.find((m) => m.id === id).build()
  host.updateMatrixWorld(true)
  const hb = solidBox(host), cz = (hb.min.z + hb.max.z) / 2
  const before = snapshot(host)
  host.userData.setCutaway(true)
  const out = []
  for (const m of changed(host, before)) {
    const b = new Box3().setFromObject(m)
    const what = `${id}: ${m.name || m.geometry?.type || m.type}${m.userData.fx ? ` (${m.userData.fx})` : ''}`
    if (m.userData.fx === 'fluid') out.push(`${what} — a liquid made see-through`)
    else if (b.min.z < cz - NEAR_EPS) out.push(`${what} — reaches behind the centre (z ${b.min.z.toFixed(3)} < ${cz.toFixed(3)}): not the near wall`)
  }
  return out
}

describe('cutaway — removes a wall, not the scene', () => {
  const ids = ['water_bath', 'ice_bucket', 'centrifuge', 'gel_rig', 'freezer', 'plate_reader']
  for (const id of ids) {
    it(`${id}: only the near wall changes`, () => {
      const m = MODELS.find((x) => x.id === id)
      const probe = m.build()
      if (!probe.userData.setCutaway) return               // declares no cutaway
      expect(nearWallDefects(id)).toEqual([])
    })
  }
  it('the subject seated in a cut-away instrument is never made see-through', () => {
    const bath = demo.buildWaterBath(), tube = demo.buildTube({})
    placeInto(tube, bath, bath.userData.sampleSocket, { ride: true })
    bath.updateMatrixWorld(true)
    const before = snapshot(tube)
    bath.userData.setCutaway(true)
    expect(changed(tube, before).map((m) => m.name || m.type)).toEqual([])
  })
})
