// NEUTROPHIL 23 — "Keep the RNA on ice until measurement, store at −80 °C", then the
// measurements (24–26). The station shows what happens NOW: the tube goes onto ice and
// stays there; no freezer. 24 takes it from the ice for the NanoDrop.
// (stationAudit.withStation: configured, framed and driven exactly as the runner does.)
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { installHeadless } from './headless.js'
installHeadless()

const RNA = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'protocols', 'neutrophil_rna.json'), 'utf8'))
let withStation, stations, station
beforeAll(async () => {
  ;({ withStation } = await import('./stationAudit.js'))
  const { partitionSteps } = await import('../lib/runtime.js')
  stations = partitionSteps(RNA.steps).stations
  station = (n) => ({ ...RNA, steps: stations })   // the runner builds the line from the stations
}, 60000)

const specs = (root) => { const o = new Set(); root.traverse((n) => n.userData?.spec && o.add(n.userData.spec)); return o }
const hostSpec = (v) => v.userData.placement?.host?.userData?.spec || null
const tube = (S) => S.vessels.find((v) => v.visible && v.userData.spec === 'microtube_1_5')

describe('neutrophil 23 · on ice now, through the measurements', () => {
  it('no freezer at station 23', () => withStation(station(), 22, (st) => {
    expect([...specs(st.group)].filter((s) => /freezer/.test(s))).toEqual([])
  }))
  it('the tube goes ONTO the ice (not in it at the start) and is in the ice bucket at the end', () => withStation(station(), 22, (st, { cam, S }) => {
    cam(0); expect(hostSpec(tube(S))).not.toBe('ice_bucket_4l')
    cam(1); expect(hostSpec(tube(S))).toBe('ice_bucket_4l')
  }))
})

describe('neutrophil 24 · taken from the ice for the NanoDrop', () => {
  it('the tube starts in the ice bucket and is out of it, beside the NanoDrop, by the reading', () => withStation(station(), 23, (st, { cam, S }) => {
    expect(specs(st.group).has('ice_bucket_4l')).toBe(true)
    cam(0); expect(hostSpec(tube(S))).toBe('ice_bucket_4l')
    cam(1); expect(hostSpec(tube(S))).not.toBe('ice_bucket_4l')
  }))
})
