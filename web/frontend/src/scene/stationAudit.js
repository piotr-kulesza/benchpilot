// stationAudit.js — build every station of a protocol HEADLESS, exactly as the runner
// does (stationConfig + configureStation), drive it to a few poses, and run the geometry
// checks (geometryAudit.js) on what is there. Needs installHeadless() before import.
import { Scene, Group, Matrix4 } from 'three'
import * as demo from './demoScene.js'
import { configureStation, stationConfig, lineStateChain, producedInRunOf, frameStation, frameAt, addStationLabel } from '../vessel/StationScene.jsx'
import { cameraPose } from '../vessel/stationCamera.js'
import { visibilityDefects, makeCamera } from './visibilityAudit.js'
import { sampleContainerSequence } from '../vessel/sceneRecipe.js'
import { placeOnBench } from './sockets.js'
import { inventory, contactDefects, containmentDefects, interpenetrationDefects, relativeScaleDefects, stabilityDefects } from './geometryAudit.js'

export const POSES = Array.from({ length: 41 }, (_, k) => k / 40)
const MOTION_DP = 0.02    // a pose's neighbour for the "is it being carried?" test
const MOTION_EPS = 1e-3   // world units / radians of change that count as motion

let _ready = false
function setup() {
  if (!_ready) { demo.buildSharedMaps(); _ready = true }
  const scene = new Scene()
  demo.setScene(scene)
  demo.initPreps()
  const S = demo.initSample()
  return { scene, S }
}

// settle every animated device (lids, doors, drawers ease toward their target)
function settle(st, S) {
  for (let k = 0; k < 6; k++) {
    for (const u of st.updatables) u.userData?.update?.(1)
    for (const v of S.vessels) v.userData?.update?.(1)
  }
}

function drive(st, S, p) {
  demo.setSnap(true)
  st.timeline?.(p)
  settle(st, S)
  // EVERYTHING's world matrices — the travelling sample and the prep tubes live directly in
  // the scene (not in the station group); a stale matrix put a prep where it USED to be
  let root = st.group; while (root.parent) root = root.parent
  root.updateMatrixWorld(true)
}

function snapshotMatrices(objs) { return objs.map((o) => { o.node.updateWorldMatrix(true, false); return new Matrix4().copy(o.node.matrixWorld) }) }
function moved(a, b) { for (let i = 0; i < 16; i++) if (Math.abs(a.elements[i] - b.elements[i]) > MOTION_EPS) return true; return false }

// the travelling objects that are part of THIS station at this pose
function travellers(st, S) {
  const out = S.vessels.filter((v) => isShown(v))
  for (const p of demo.getPreps()) if (isShown(p)) out.push(p)
  return out
}
function isShown(o) { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }

export function auditProtocol(protocol, { poses = POSES } = {}) {
  const { scene, S } = setup()
  const steps = protocol.steps || []
  const containers = sampleContainerSequence(steps)
  const stateChain = lineStateChain(steps, 'en')
  const producedInRun = producedInRunOf(steps)
  const stations = []
  for (let i = 0; i < steps.length; i++) {
    demo.undockSample()
    for (const pr of demo.getPreps()) pr.visible = false
    const st = { group: new Group(), updatables: [], reagents: {}, pip: null, enter: null, timeline: null, x: 0, cen: null, dev: null, vis: 1, _vstate: -1 }
    const { opts } = stationConfig(steps, i, { containers, stateChain, lang: 'en', producedInRun })
    configureStation(st, opts)
    st.frame = frameStation(st)                // as the runner: framing sets out-sized sources down out of frame
    scene.add(st.group)
    demo.setSnap(true)
    st.enter?.()
    // a carried mixture: visible where it is made, and parked at the station that draws it
    if (st.prep) st.prep.visible = true
    if (st.drawsFromId && demo.getPrep(st.drawsFromId)) {
      const pr = demo.getPrep(st.drawsFromId); pr.visible = true
      pr.position.set(st.drawPos.x, st.drawPos.y, st.drawPos.z); pr.userData.tPos.copy(pr.position)
      placeOnBench(pr)                                           // put down: in the stand set out for it
    }
    const record = { index: steps[i].index ?? i, action: opts.action, equipment: opts.equipment, container: opts.container, defects: [] }
    // a vessel a socket refused is a containment ERROR (it was kept out, not drawn in)
    for (const e of st.socketErrors || []) record.defects.push({ check: 'containment', kind: 'rejected', object: e.vessel, host: e.host, socket: e.socket, p: 0 })
    for (const p of poses) {
      drive(st, S, p)
      const objs = inventory(st, travellers(st, S))
      const m0 = snapshotMatrices(objs)
      drive(st, S, p >= 1 ? 1 - MOTION_DP : p + MOTION_DP)
      const m1 = snapshotMatrices(objs)
      drive(st, S, p)
      const resting = new Set(objs.filter((o, k) => !moved(m0[k], m1[k])))
      const tag = (d) => ({ ...d, p })
      record.defects.push(
        ...contactDefects(objs, (o) => resting.has(o)).map(tag),
        ...stabilityDefects(objs, (o) => resting.has(o)).map(tag),
        ...containmentDefects(objs).map(tag),
        ...interpenetrationDefects(objs).map(tag),
        ...(p === poses[0] ? relativeScaleDefects(objs).map(tag) : []),
      )
    }
    scene.remove(st.group)
    demo.undockSample()
    stations.push(record)
  }
  return stations
}

// Distinct defects per check: one per (station, check, kind, objects) — a defect present
// at several poses of the same station counts once.
export const CHECKS = ['contact', 'stability', 'containment', 'interpenetration', 'relativeScale']
export function distinctKey(stationIndex, d) {
  return [stationIndex, d.check, d.kind || '', d.object || d.a || '', d.host || d.into || d.on || d.b || ''].join('|')
}
// accepted exceptions (geometry-exceptions.json): a matching defect leaves the red count;
// an exception that matches nothing is STALE and counts as a failure
export function applyExceptions(rows, exceptions, protocolsAudited) {
  const used = new Set()
  const kept = []
  const accepted = []
  for (const r of rows) {
    const k = exceptions.findIndex((e) => e.protocol === r.protocol && e.step === r.step && e.check === r.check && e.kind === r.kind && e.object === r.object && e.host === r.host)
    if (k >= 0) { used.add(k); accepted.push({ ...r, exception: exceptions[k] }) } else kept.push(r)
  }
  const stale = exceptions.filter((e, k) => !used.has(k) && protocolsAudited.includes(e.protocol))
  return { rows: kept, accepted, stale }
}
export function summarize(protocolResults) {
  const counts = Object.fromEntries(CHECKS.map((c) => [c, 0]))
  const rows = []
  for (const { id, stations } of protocolResults) {
    for (const s of stations) {
      const seen = new Set()
      for (const d of s.defects) {
        const k = distinctKey(s.index, d)
        if (seen.has(k)) continue
        seen.add(k)
        counts[d.check]++
        rows.push({ protocol: id, step: s.index, action: s.action, equipment: s.equipment, container: s.container, ...d })
      }
    }
  }
  return { counts, rows }
}

// ── LEGIBILITY: the subject through the station's own camera ───────────────────────────
export const VIS_POSES = [0, 0.25, 0.5, 0.75, 1]
export const VIS_CHECKS = ['area', 'occlusion', 'safeArea', 'dominance']
// the objects that may not out-size the subject: every spec'd object on the station and every
// other travelling vessel — minus the subject's holder chain (it sits IN them), the step's
// instrument (all of it: a gel rig's tank and power supply), held tools (offBench), bench
// holders (a tube stand is furniture), and the step's other subjects (a transfer acts on
// its source AND its destination)
export function rivalsOf(st, subject, travellers, cosubjects = []) {
  const exempt = new Set([st.dev, st.cen, st.pip, ...cosubjects].filter(Boolean))
  for (let n = subject; n; n = n.userData?.placement?.host || n.parent) exempt.add(n)
  const out = []
  const visit = (node) => {
    if (!node || node.isLight || node.isSprite || node.userData?.offBench || node.userData?.holder || exempt.has(node)) return
    if (node.userData?.spec) { if (!exempt.has(node)) out.push(node); return }
    for (const c of node.children) visit(c)
  }
  for (const c of st.group.children) visit(c)
  for (const v of travellers) if (v !== subject) visit(v)
  return out
}
// build station i of a protocol headless, framed and entered exactly as the runner does,
// and hand it to fn(st, { S, opts, cam(p) }) — cam(p) drives it to p and returns the
// runner's camera there. The station is torn down after.
function buildStation(scene, S, steps, i, ctx) {
  demo.undockSample()
  for (const pr of demo.getPreps()) pr.visible = false
  const st = { group: new Group(), updatables: [], reagents: {}, pip: null, enter: null, timeline: null, x: 0, cen: null, dev: null, vis: 1, _vstate: -1 }
  const { opts, o } = stationConfig(steps, i, { ...ctx, lang: 'en' })
  configureStation(st, opts)
  st.frame = frameStation(st)                // framed exactly as the runner frames it
  addStationLabel(st, o.title, o.sub)
  scene.add(st.group)
  demo.setSnap(true)
  st.enter?.()
  if (st.prep) st.prep.visible = true
  if (st.drawsFromId && demo.getPrep(st.drawsFromId)) { const pr = demo.getPrep(st.drawsFromId); pr.visible = true; pr.position.set(st.drawPos.x, st.drawPos.y, st.drawPos.z); pr.userData.tPos.copy(pr.position); placeOnBench(pr) }
  return { st, opts }
}
function lineContext(steps) {
  return { containers: sampleContainerSequence(steps), stateChain: lineStateChain(steps, 'en'), producedInRun: producedInRunOf(steps) }
}
export function withStation(protocol, i, fn) {
  const { scene, S } = setup()
  const steps = protocol.steps || []
  const { st, opts } = buildStation(scene, S, steps, i, lineContext(steps))
  const cam = (p) => { drive(st, S, p); return makeCamera(cameraPose(frameAt(st, p), { push: st.pushCam ? st.pushCam(p) : 0, pushTarget: st.pushTarget })) }
  try { return fn(st, { S, opts, cam }) } finally { scene.remove(st.group); demo.undockSample() }
}
export function auditVisibility(protocol, { poses = VIS_POSES } = {}) {
  const { scene, S } = setup()
  const steps = protocol.steps || []
  const ctx = lineContext(steps)
  const stations = []
  for (let i = 0; i < steps.length; i++) {
    const { st, opts } = buildStation(scene, S, steps, i, ctx)
    const record = { index: steps[i].index ?? i, action: opts.action, equipment: opts.equipment, container: opts.container, defects: [] }
    const cosubjects = [...(st.subjectAt ? POSES.map((q) => st.subjectAt(q)) : []), ...(st.cosubjects ? st.cosubjects() : [])]
    for (const p of poses) {
      drive(st, S, p)
      const push = st.pushCam ? st.pushCam(p) : 0
      const cam = makeCamera(cameraPose(frameAt(st, p), { push, pushTarget: st.pushTarget }))
      const subject = st.subjectAt ? st.subjectAt(p) : st.subject ? st.subject() : null
      const roots = [st.group, ...S.vessels.filter((v) => v !== subject), ...demo.getPreps().filter((v) => v !== subject)]
      for (const d of visibilityDefects(cam, subject, roots, rivalsOf(st, subject, travellers(st, S), cosubjects))) { const e = { ...d, p, object: subject?.userData?.spec || '?' }; if (d.blocker) Object.defineProperty(e, 'blocker', { value: d.blocker }); record.defects.push(e) }
    }
    scene.remove(st.group)
    demo.undockSample()
    stations.push(record)
  }
  return stations
}
export function summarizeVisibility(protocolResults) {
  const counts = Object.fromEntries(VIS_CHECKS.map((c) => [c, 0]))
  const rows = []
  for (const { id, stations } of protocolResults) for (const s of stations) {
    const seen = new Set()
    for (const d of s.defects) {
      if (seen.has(d.check)) continue      // one per (station, check): the station is illegible
      seen.add(d.check); counts[d.check]++
      rows.push({ protocol: id, step: s.index, action: s.action, equipment: s.equipment, container: s.container, ...d })
    }
  }
  return { counts, rows }
}
