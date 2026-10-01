// StationScene — mounts the DEMO's real builders AND drives the DEMO's real
// station choreography (demoScene.js, lifted verbatim). Per active step we build
// a station via the demo's stationReagent / stationSpin / addStand + the resident
// pipette rig, call its enter() (initial state), and drive its timeline(p) every
// frame from a per-step animation clock — so the pipette travels bottle→vessel
// and the fill only ramps in inside the dispense window (demo.dispenseProgress).
//
// Ours (the parts that generalise): resolveRecipe(action) → which station kind to
// build; the single travelling SAMPLE + container hand-offs; the cinematic camera
// rig + navigation; the DOM overlay.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { FogExp2, Color, Vector3, Box3, Group, Mesh, SphereGeometry, CylinderGeometry, PlaneGeometry, CanvasTexture, MeshStandardMaterial, MeshBasicMaterial, PointLight } from 'three'
import { reagentColor } from './theme.js'
import { resolveRecipe, stepConditions, sampleContainerSequence, resolveRemoval, findTransferHandoffDefects, exitLiftPoint, pourPlan, removalFor, benchStaging, addSource, sceneStep } from './sceneRecipe.js'
import { containerContract, transferKind, sideBySide } from './containerContract.js'
import { reagentName, reagentVolume, effectiveStep, selectAlternative, hasAlternatives } from '../lib/runtime.js'
import * as demo from '../scene/demoScene.js'
import { streams } from '../scene/rng.js'
import { dims, clearance } from '../scene/dims.js'
import { cameraPose, fitFrame, frameNdc, viewDir, CAM } from './stationCamera.js'
import { solidBox } from '../scene/solids.js'
import { placeInto, placeOnBench, clearPlacement, getSocket, socketPose, canPlace, SocketError, addSocket, registerBenchHolder, socketAccepts } from '../scene/sockets.js'
import { resolveScenePreset } from '../scene/scenePresets.js'

// the demo's cinematic camera — the one and only view
const FOV = 40
const RAIL_Y = 3.35
const RAIL_Z = 9.6
const LOOK_Y = 1.05
const STEP_DUR = 6.5 // the demo's per-step animation window (seconds)
const SPACING = 8.4 // distance between stations along +X (the demo's buildLine)
const GLIDE_DUR = 1.65 // camera rail-dolly duration on a step change (the demo)
// Camera framing is MEASURED from each station's content bounding box, never assumed
// to sit at the origin (a centrifuge is parked off to one side, a CO₂ incubator is
// wide and deep). R_REF is the content radius the demo's fixed distance frames
// comfortably; larger rigs back the camera off gently, nothing zooms IN past it.
const R_REF = 3.0
// station equipment fade by distance from the framed point (railX): the active
// station is full, neighbours recede into fog, and mid-dolly BOTH are visible.
const VIS_FULL = SPACING * 0.5 // fully visible within here
// point-light slots: at most ~3 stations are visible at once, each with at most one light
const LIGHT_POOL = 4
const VIS_GONE = SPACING * 1.6 // faded out beyond here
// (container → sample-vessel geometry is now owned by containerContract.js — the
// microtube is one implementation of that contract, not the baked-in default.)

// Snapshot each station's material opacities so the whole unit (equipment +
// labels + decal + shadow) can be faded in/out together — ported from the demo's
// collectStationMats / applyStationVis so neighbours can recede without being
// destroyed. `st.mats` holds {m, o (base opacity), t (base transparent)}.
function collectStationMats(st) {
  const seen = new Set()
  st.mats = []
  const fold = (root) => root?.traverse?.((o) => {
    const arr = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of arr) {
      if (m && !seen.has(m)) { seen.add(m); st.mats.push({ m, o: m.opacity == null ? 1 : m.opacity, t: !!m.transparent }) }
    }
  })
  fold(st.group)
  ;[st.decal, st.benchTag].forEach((mesh) => {
    if (mesh?.material) { const m = mesh.material; if (!seen.has(m)) { seen.add(m); st.mats.push({ m, o: m.opacity == null ? 1 : m.opacity, t: !!m.transparent }) } }
  })
}
// a station's fade target at distance d from the rail. `solo`: the active station frames
// from its own view direction and the dolly has arrived — every other station is out.
export function stationVisTarget(d, { solo = false, active = false } = {}) {
  if (solo && !active) return 0
  return Math.min(1, Math.max(0, 1 - (d - VIS_FULL) / (VIS_GONE - VIS_FULL)))
}
function applyStationVis(st) {
  const f = st.vis
  if (f <= 0.006) { // fully out — hide and skip material work
    if (st._vstate !== 0) { st.group.visible = false; if (st.decal) st.decal.visible = false; if (st.benchTag) st.benchTag.visible = false; st._vstate = 0 }
    return
  }
  if (st._vstate === 0) { st.group.visible = true; if (st.decal) st.decal.visible = true; if (st.benchTag) st.benchTag.visible = true }
  if (f >= 0.994) { // fully in — restore the base look once
    if (st._vstate !== 2) { for (const e of st.mats) { e.m.transparent = e.t; e.m.opacity = e.o }; st._vstate = 2 }
  } else { // mid-fade — scale every opacity by f
    for (const e of st.mats) { e.m.transparent = true; e.m.opacity = e.o * f }
    st._vstate = 1
  }
}

// Frame the camera on a station's ACTUAL content (Stage-12 #2): measure the composed
// equipment group's bounding box in station-LOCAL coords (the group is still at the
// origin when this runs) and union in the sample column that rests at local origin
// (the sample is a separate global object, never a child of the group). Returns the
// { center, radius } the camera aims at and fits — so a centrifuge parked off to one
// side, a wide CO₂ incubator, and a lone tube all sit centred and correctly sized.
const _frameBox = new Box3()
const _frameSize = new Vector3()
const _childBox = new Box3()
// Grow `box` by every mesh under `obj`, but PRUNE any subtree tagged `userData.noFrame`
// (the pipette rig, reagent bottles — pipetting dressing that travels high/wide and
// would drag the fit off the actual props). Recurse by hand so a pruned node takes its
// whole subtree with it (Object3D.traverse can't skip children).
function expandByProps(box, obj) {
  if (obj.userData && obj.userData.noFrame) return
  if (obj.isMesh && obj.geometry) {
    _childBox.setFromObject(obj)
    if (!_childBox.isEmpty()) box.union(_childBox)
  }
  for (const c of obj.children) expandByProps(box, c)
}
// #11 — a pipette dispensing down a flask's canted neck rests, tilted, with its body
// reaching up and out along the neck axis; the camera must take it in. Frame it by an
// ANCHOR at the pipette's top in that pose — the pipette's REAL length along the neck axis
// from its standoff — and keep its stand in frame too.

// Actions whose station, with no modelled instrument, rests the sample on the bench.
const BENCH_REST_ACTIONS = new Set(['incubate_wait', 'heat', 'store', 'measure', 'centrifuge', 'generic'])

// A flat tag printed on the bench beside the station number (same treatment as the
// decal): the condition the step states — "37 °C", "room temperature".
function makeBenchTag(text) {
  // sized to its text (measured), so a long condition is never clipped
  const FS = 60, PADX = 34, H = 104
  const c = document.createElement('canvas')
  let g = c.getContext('2d'); g.font = `500 ${FS}px 'IBM Plex Sans', sans-serif`
  const W = Math.ceil(g.measureText(text).width + PADX * 2)
  c.width = W; c.height = H
  g = c.getContext('2d'); g.font = `500 ${FS}px 'IBM Plex Sans', sans-serif`
  g.fillStyle = 'rgba(58,68,82,0.9)'
  g.beginPath(); g.roundRect(0, 0, W, H, 22); g.fill()
  g.fillStyle = '#eef2f5'; g.textBaseline = 'middle'; g.fillText(text, PADX, H / 2 + 2)
  const t = new CanvasTexture(c)
  const worldH = 0.42
  const m = new Mesh(new PlaneGeometry(worldH * W / H, worldH), new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  m.userData.width = worldH * W / H
  return m
}

// the station's title plate, above the frame's content (shared with the visibility audit)
// It names the SUBJECT, so it stands over the subject (not over the middle of the props —
// it floated over the idle sample while the step made a mix beside it), and is sized to
// the FRAME (a constant share of its height), since the camera now zooms to the subject.
const LABEL_SHARE = 0.05, LABEL_GAP_SHARE = 0.05   // smaller, and clear of the subject (at 7.5 % it sat mid-frame on it)
export function addStationLabel(st, title, sub) {
  const label = demo.makeLabel(title, sub)
  // sized to the TIGHTEST frame of the step (sized to the first, a station that zooms in after
  // it — a thermocycler whose lid closes — blew the plate up across the top of the frame)
  const dMin = st.frames && st.frames.length ? Math.min(...st.frames.map((f) => f.dist)) : st.frame.dist
  const frameH = dMin != null ? 2 * dMin * Math.tan((FOV / 2) * Math.PI / 180) : 7
  const wh = label.userData.worldH || 0.5
  const k = (LABEL_SHARE * frameH) / wh
  label.scale.multiplyScalar(k)
  const halfH = (wh * k) / 2
  // WHERE: a title that names a REAGENT stands over that reagent's SOURCE (it read as naming
  // whatever it floated over); any other title stands over the step's SUBJECT as the step
  // ends (a handoff's outgoing vessel, framed first, is not what the step is about). Over the
  // object's BACK edge: from the front-above camera the plate then projects above it — centred
  // over a flat membrane it hid it completely.
  let sb = (st.frames && st.frames[st.frames.length - 1].subjectBox) || st.frame.subjectBox
  const src = st.group.children.find((c) => c.userData.used && c.userData.reagentName && c.userData.reagentName === title)
  if (src) { st.group.updateMatrixWorld(true); sb = solidBox(src, st.group) }
  // a SOURCE's title stands over its FRONT edge: anchored at its back edge the plate
  // projected up and behind it — onto the next row's tube (PCR 1 read as naming the tube
  // behind the one it names). A flat subject keeps the back-edge anchor, so the plate does
  // not cover it.
  const cx = sb ? (sb.min.x + sb.max.x) / 2 : st.frame.center.x, cz = sb ? (src ? sb.max.z : sb.min.z) : st.frame.center.z
  const top = sb ? sb.max.y : st.frame.top
  label.position.set(cx, top + LABEL_GAP_SHARE * frameH + halfH, cz)
  st.group.add(label)
  st.label = label; st.labelBaseY = label.position.y; st.labelHalfH = halfH
  return label
}

const LABEL_TOP_NDC = 0.8
const _lp = new Vector3()
function clampLabel(st, cam) {
  cam.updateMatrixWorld(); st.group.updateMatrixWorld()
  const lab = st.label
  const floorY = st.frame.top + st.labelHalfH + 0.05
  let y = st.labelBaseY
  for (let i = 0; i < 60; i++) {
    _lp.set(lab.position.x, y + st.labelHalfH, lab.position.z)
    st.group.localToWorld(_lp); _lp.project(cam)
    if (_lp.y <= LABEL_TOP_NDC || y <= floorY) break
    y -= 0.05
  }
  lab.position.y = Math.max(y, Math.min(floorY, st.labelBaseY))
}

// FRAME THE STATION FROM ITS SUBJECT (stationCamera.fitFrame). The subject's box is its
// extent over the WHOLE step (driven through its timeline at build, snapped, then
// released), so the camera holds every pose of it; `used` adds the props the step uses
// (back-row sources, the waste, a second vessel: userData.used / frameAnchors); `context`
// is everything on the station. The camera only moves and zooms.
const FRAME_POSES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
function shownIn(o) { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true }
// the subject's box (station-local) at each FRAME_POSE — the station is driven (snapped)
function subjectBoxes(st) {
  return FRAME_POSES.map((p) => {
    st.timeline?.(p)
    st.group.updateMatrixWorld(true)
    const s = st.subjectAt ? st.subjectAt(p) : st.subject?.()
    // a station may frame a PART of an instrument subject — what shows the step (a cycler's
    // display and the tube in its block; a rotor) — rather than the whole machine
    const b = st.frameBoxAt ? st.frameBoxAt(p) : s && shownIn(s) ? solidBox(s) : new Box3()
    if (!b.isEmpty()) b.translate(new Vector3(-st.x, 0, 0))   // world → station-local
    return b
  })
}
export function frameStation(st) {
  const snap = demo.getSnap()
  // the travelling sample lives in WORLD coordinates (st.x + local) while a docked one rides
  // a part inside the group: measure with the group where it will stand, then back to local
  const gx = st.group.position.x
  st.group.position.x = st.x
  demo.setSnap(true)
  st.enter?.()
  // THE DISPENSE IS FRAMED: where the held pipette's tip delivers — its LOWEST point over
  // the subject in the whole step (a prepare runs several draws, so no fixed p is "the"
  // dispense) — the tip and the foot of its shaft are in the frame; the pipette used to hang
  // cropped above it
  const anchors = []
  if (st.pip) {
    let tip = null
    for (let k = 0; k <= 100; k++) {
      const q = k / 100
      st.timeline?.(q); st.group.updateMatrixWorld(true)
      const s = st.subjectAt ? st.subjectAt(q) : st.subject?.()
      if (!s || !shownIn(s)) continue
      const sb = solidBox(s).translate(new Vector3(-st.group.position.x, 0, 0))
      const t = st.pip.position
      if (![t.x, t.y, t.z].every(Number.isFinite)) continue
      if (t.x < sb.min.x || t.x > sb.max.x || t.z < sb.min.z || t.z > sb.max.z) continue   // not over the subject
      if (!tip || t.y < tip.y) tip = t.clone()
    }
    if (tip) anchors.push(tip, new Vector3(tip.x, tip.y + dims('pipette_p200').tip_length * 0.5, tip.z))   // the tip in the mouth, half its cone above
    st.enter?.()
  }
  const boxes = subjectBoxes(st)
  demo.undockSample()
  demo.setSnap(snap)
  st.group.position.x = gx
  st.group.updateMatrixWorld(true)
  const fallback = new Box3(new Vector3(-0.05, 0, -0.05), new Vector3(0.05, st.subjectH || 0.4, 0.05))
  for (let k = 0; k < boxes.length; k++) if (boxes[k].isEmpty()) boxes[k] = (boxes[k - 1] && !boxes[k - 1].isEmpty()) ? boxes[k - 1].clone() : fallback.clone()
  const outsized = st.group.children.filter((c) => c.userData.offFrame)   // (stageSources)
  // used props (static) and the rest of the station (context)
  const usedProps = new Box3(), ctxProps = new Box3()
  for (const c of st.group.children) {
    if (c.isLight || c.isSprite || c === st.pip || c.userData.offBench) continue
    const b = solidBox(c, st.group); if (b.isEmpty()) continue
    if (c.userData.used) usedProps.union(b)
    if (!c.userData.noFrame || c.userData.used) ctxProps.union(b)
  }
  for (const a of [...(st.frameAnchors || []), ...anchors]) { usedProps.expandByPoint(a); ctxProps.expandByPoint(a) }
  // ONE FRAME PER POSE: the camera follows the subject through the step (it may move and
  // zoom; it never rescales) — a tube carried from the bench into a rotor is framed on the
  // bench, then on the rotor, not as a speck in a frame holding the whole path
  st.frames = boxes.map((sb) => {
    const used = sb.clone().union(usedProps), context = st.tightFrame ? used.clone() : used.clone().union(ctxProps)
    const f = fitFrame(sb, used, context, st.viewDir || null, { macro: !st.instrumentFrame })
    const sc = sb.getCenter(new Vector3()), sz = sb.getSize(new Vector3())
    f.top = sb.max.y
    f.footprint = { cx: sc.x, cz: sc.z, r: 0.5 * Math.max(sz.x, sz.z) }
    return f
  })
  // …then set the out-sized sources down to the RIGHT, clear of everything on the bench and
  // past the frame edge in every pose (the camera only moves and zooms; the bench is laid
  // out around what it frames)
  const SWAY = 0.04, STEP = clearance('bench_gap')
  for (const g of outsized) {
    // a reagent seated in a RACK stays in it: the rack's own layout keeps it clear of the frame
    if (g.userData.placement?.host?.userData?.rack) continue
    st.group.updateMatrixWorld(true)
    // a source standing in a tube stand is set down WITH its stand (the stand was left
    // behind, holding nothing, while the tube claimed to be in it 80 mm away)
    const stand = g.userData.placement?.host?.userData?.holder ? g.userData.placement.host : null
    const b0 = solidBox(g, st.group), off = b0.min.x - g.position.x
    if (stand) b0.union(solidBox(stand, st.group))
    const ext = demo.benchExtents(st, g)
    let x = Math.max(g.position.x, ext.maxX + clearance('bench_gap') - off)
    const out = (bx) => st.frames.every((f) => frameNdc(b0.clone().translate(new Vector3(bx - g.position.x, 0, 0)), f).x0 > 1 + SWAY)
    for (let k = 0; k < 400 && !out(x); k++) x += STEP
    if (stand) stand.position.x += x - g.position.x
    g.position.x = x
    if (g.userData.home) g.userData.home.copy(g.position)            // a poured bottle starts and ends here
  }
  // …and an out-sized bottle that is POURED is tipped from high enough that, over the vessel,
  // it is past the frame top: only its stream comes into the picture
  if (st.pour && st.pour.bottle.userData.offFrame) {
    const snap2 = demo.getSnap(); demo.setSnap(true)
    const f = frameAt(st, st.pour.pose), cap = clearance('lift') * 40
    const above = () => { st.timeline?.(st.pour.pose); st.group.updateMatrixWorld(true); return frameNdc(solidBox(st.pour.bottle, st.group), f).y0 > 1 }
    for (let L = st.pour.lift(); L < cap && !above(); L += clearance('lift') * 0.4) st.pour.setLift(L)
    st.enter?.(); demo.setSnap(snap2)
  }
  st.group.updateMatrixWorld(true)
  return st.frames[0]
}
const DIR0 = new Vector3(0, CAM.RAIL_Y - CAM.LOOK_Y, CAM.RAIL_Z).normalize()
// the frame at step progress p: interpolated between the fitted poses
const _fc = new Vector3()
export function frameAt(st, p) {
  const fs = st.frames
  if (!fs || !fs.length) return st.frame
  const t = Math.min(1, Math.max(0, p)) * (fs.length - 1), k = Math.min(fs.length - 2, Math.floor(t)), u = t - k
  const a = fs[k], b = fs[k + 1] || a
  const dir = (a.dir || b.dir) ? (a.dir || DIR0).clone().lerp(b.dir || DIR0, u).normalize() : null
  return { center: _fc.copy(a.center).lerp(b.center, u).clone(), dist: a.dist + (b.dist - a.dist) * u, dir }
}

export function computeStationFrame(st) {
  st.group.updateMatrixWorld(true)
  _frameBox.makeEmpty()
  // fit the PROPS only — the sample vessel(s) + the instrument, never the dressing.
  expandByProps(_frameBox, st.group)
  _frameBox.expandByPoint(new Vector3(0, 0, 0))                    // the sample's resting column at the
  _frameBox.expandByPoint(new Vector3(0, st.subjectH || 0, 0))     // local origin: its REAL height
  // stations that place the sample AWAY from the origin (a two-vessel transfer, a rotor
  // slot) declare anchor points so every prop stays in frame.
  for (const a of st.frameAnchors || []) _frameBox.expandByPoint(a)
  const center = _frameBox.getCenter(new Vector3())
  _frameBox.getSize(_frameSize)
  const radius = 0.5 * Math.max(_frameSize.x, _frameSize.y, _frameSize.z)
  // top = the props' bbox ceiling, so the label can sit just ABOVE the thing it names.
  // footprint = the HORIZONTAL extent (x/z), so the bench dial can encircle the subject's
  // base with a radius measured from it — same measure-don't-assume principle as the fit.
  const footprint = { cx: center.x, cz: center.z, r: 0.5 * Math.max(_frameSize.x, _frameSize.z) }
  return { center, radius, top: _frameBox.max.y, footprint }
}
const DEFAULT_FRAME = { center: new Vector3(0, LOOK_Y, 0), radius: R_REF }

// (no countdown dial on the bench: the timer lives in the HUD)

// The ONE sample persists across every step, carrying its contents. Its state at
// the start of step N is exactly its state at the end of step N-1 (chained). We
// fold this deterministically over the whole protocol (not a mutable ref) so a
// deep-link/back jump still lands the sample in the right carried state.
const INIT_COLOR = 0xb8b2a6 // neutrophil pellet — where the sample begins
const INIT_LEVEL = 0.3
// How each action leaves the sample. `prev` = carried-in state; `color`/`fill`
// = this step's reagent colour + target level. Reagent steps take the new colour;
// physical steps carry the colour and only move the level.
function stepEnd(action, prev, color, fill) {
  switch (action) {
    case 'pour_add': return { color, level: Math.max(prev.level, fill) } // added volume raises level
    case 'pipette_mix': return { color, level: prev.level }
    case 'transfer': return { color: prev.color, level: 0.9 } // loaded onto the column
    case 'centrifuge': return { color: prev.color, level: 0.2 } // spun down, supernatant/flow-through gone
    case 'elute': return { color, level: 0.45 } // eluate collected
    case 'discard': return { color: prev.color, level: 0.05 }
    case 'seed': return { color, level: Math.max(prev.level, fill) } // dispensed into a culture vessel
    case 'stain': return { color, level: Math.max(prev.level, fill) } // dye floods over the surface
    default: return { color: prev.color, level: prev.level } // vortex/homogenize/incubate/heat/cool/measure/thermocycle/electrophorese/store — no change
  }
}

// build the demo's shared PBR maps once, before any builder runs.
let _maps = false
function ensureMaps() {
  if (!_maps) {
    demo.buildSharedMaps()
    _maps = true
  }
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) {
      for (const k in m) {
        const v = m[k]
        if (v && v.isTexture) v.dispose()
      }
      m.dispose?.()
    }
  })
}

const hideLabels = (root) => root.traverse((o) => o.userData?.label && (o.userData.label.visible = false))

// the demo's LOOK.cinematic light values. The demo (three r128) used LEGACY
// lights; modern three (r0.169) is physically-correct and divides diffuse by π,
// so the same intensities render ~π× dimmer (that's why the bench went muddy).
// Scale by π to restore the demo's brightness.
const LIGHT_SCALE = 3.3
// r169 renders this scene warmer than r128 did (the warm key dominates), so the
// cool fill (#ccd4de) gets an extra boost to neutralise the bench's tan cast —
// tuned by measuring bench pixels against the HTML demo, not by eye.
const FILL_BOOST = 1
// the floor faces UP, so its cool light comes from the hemisphere sky (#dde4ee),
// not the grazing fill. Boost hemi to neutralise the bench's warm cast.
const HEMI_BOOST = 1
function Lights({ keyRef, rimRef, preset }) {
  const L = preset.lights
  return (
    <>
      <ambientLight color={L.amb.color} intensity={L.amb.int * LIGHT_SCALE} />
      <hemisphereLight color={L.hemi.sky} groundColor={L.hemi.ground} intensity={L.hemi.int * LIGHT_SCALE * HEMI_BOOST} />
      <directionalLight
        ref={keyRef}
        color={L.key.color}
        intensity={L.key.int * LIGHT_SCALE}
        position={L.keyPos}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={44}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={11}
        shadow-camera-bottom={-9}
      />
      <directionalLight color={L.fill.color} intensity={L.fill.int * LIGHT_SCALE * FILL_BOOST} position={L.fill.pos} />
      <directionalLight color={L.aux.color} intensity={L.aux.int * LIGHT_SCALE} position={L.aux.pos} />
      {/* rim/edge light (dark preset only) — follows the framed station (positioned in the frame loop) */}
      {L.rim && <directionalLight ref={rimRef} color={L.rim.color} intensity={L.rim.int * LIGHT_SCALE} position={L.rimPos} />}
    </>
  )
}

// the demo's one continuous resin bench spanning the whole station line (per preset).
function Floor({ totalLen, preset }) {
  const floor = useMemo(() => demo.buildFloor(totalLen, preset), [totalLen, preset])
  useEffect(() => () => disposeGroup(floor), [floor])
  return <primitive object={floor} />
}

// A reagent SOURCE for a multi-reagent pass: normally its own bottle; but when a pour
// draws from a mixture you prepared earlier, the source is a small filled TUBE (not a
// bottle from nowhere). Registers st.reagents[key] with the pipette draw point.
function addReagentSource(st, key, r, k, fromMix) {
  if (fromMix) {
    const src = demo.buildTube({})
    src.userData.noFrame = true
    src.userData.setColor(r.color); src.userData.setLevel(0.55); src.userData.setLabel(r.name, r.vol || '')
    demo.backRowPlace(st, src)
    if (src.userData.update) st.updatables.push(src)
    st.reagents[key] = { grp: src, get pos() { return src.position.clone().setY(src.userData.entry) } }
  } else {
    demo.addBottle(st, key, r.name, r.color, r.vol)
  }
}

// Build a station for a step. Every action gets a timeline with VISIBLE motion
// driven by the per-step progress p (0->1): so no station is ever static.
//
// GEOMETRY (the scale & seating round): nothing here is positioned by a typed coordinate.
// The SUBJECT (the sample, or the instrument it goes in) stands at the station origin;
// every other item is put on the bench beside it (demo.benchPlace / benchSlot, spaced by
// real footprints + bench_gap); the sample goes INTO an instrument through a named SOCKET
// (placeInto — a vessel class the socket does not accept is recorded in st.socketErrors
// and the vessel stays on the bench, never a wrong render); every height a vessel is
// carried at is derived from the heights of what it clears (+ the lift clearance).
// A VESSEL THAT CANNOT STAND ON ITS OWN is put down in a stand (geometryAudit: stability).
// Drive the configured station through its step (snapped, the group where it will stand)
// and note every spot where such a vessel is PUT DOWN on the bare bench — the sample, a
// prep tube, a µl source tube; set out a tube stand there. Its seat is the spot itself (the
// tube's tip still rests on the bench through the stand's open floor), so no vessel moves:
// placeOnBench now finds the stand and seats the vessel in it.
const _Y = new Vector3(0, 1, 0)
const STAND_POSES = Array.from({ length: 41 }, (_, k) => k / 40)
function addBenchStands(st) {
  const S = demo.getSample()
  const spots = []
  const note = (v, local) => {
    if (!demo.standFor(v.userData.spec) || v.userData.held) return
    const pl = v.userData.placement
    if (!pl || pl.host !== 'bench') return
    const p = local ? v.position.clone() : (v.userData.tPos || v.position).clone().sub(new Vector3(st.x, 0, 0))
    if (Math.abs(p.y) > 1e-4) return                          // standing ON something else
    p.stand = demo.standFor(v.userData.spec)
    if (!spots.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1e-3)) spots.push(p)
  }
  const snap = demo.getSnap(), gx = st.group.position.x
  st.group.position.x = st.x
  demo.setSnap(true)
  st.enter?.()
  for (const p of STAND_POSES) {
    st.timeline?.(p)
    for (const v of S.vessels) if (shownIn(v)) note(v, false)
    for (const v of demo.getPreps()) if (shownIn(v)) note(v, false)
    for (const c of st.group.children) if (c.userData.spec) note(c, true)
  }
  for (const e of st.extraSpots || []) { const p = new Vector3(e.x, 0, e.z); p.stand = e.stand; if (!spots.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1e-3)) spots.push(p) }
  // a carried prep this station draws from is parked on its bench at drawPos
  if (st.drawsFromId && st.drawPos) { const p = new Vector3(st.drawPos.x - st.x, 0, st.drawPos.z); p.stand = demo.standFor(demo.getPrep(st.drawsFromId)?.userData.spec) || 'tube_stand'; if (!spots.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1e-3)) spots.push(p) }
  demo.undockSample()
  demo.setSnap(snap)
  st.group.position.x = gx
  const stands = spots.map((p) => {
    const stand = demo.buildTubeStand(p.stand)
    stand.position.set(p.x, 0, p.z)
    st.group.add(stand)
    return registerBenchHolder(stand)
  })
  // the station's own props (a µl source tube in the back row) are seated now — the group
  // is not in the scene yet, so directly; the travelling sample and the preps are seated
  // whenever they are put down (placeOnBench finds the stand)
  const seatAt = (v, p) => {
    if (!v.userData.spec || v.userData.placement?.host !== 'bench' || !demo.standFor(v.userData.spec)) return
    const k = spots.findIndex((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1e-3 && q.stand === demo.standFor(v.userData.spec))
    if (k >= 0) placeInto(v, stands[k], 'seat')
  }
  for (const c of st.group.children) seatAt(c, c.position)
  for (const v of [...S.vessels, ...demo.getPreps()]) seatAt(v, (v.userData.tPos || v.position).clone().sub(new Vector3(st.x, 0, 0)))
  st.stands = stands
}

// A SOURCE THAT OUT-SIZES THE SUBJECT stands OUT of frame (only its stream — the pipette
// bringing its reagent — comes in): a 250 mL bottle framed whole with a 41 mm tube made the
// bottle the picture. It leaves the back row (frameStation sets it down past the frame edge),
// and the back row closes up round what is left: a same-size source (a µl tube) stays, close
// behind the subject, in frame, named by the title.
function stageSources(st) {
  const snap = demo.getSnap(), gx = st.group.position.x
  st.group.position.x = st.x
  demo.setSnap(true); st.enter?.()
  const frontArea = (b) => (b.isEmpty() ? 0 : (b.max.x - b.min.x) * (b.max.y - b.min.y))
  const subjArea = Math.max(0, ...subjectBoxes(st).map(frontArea))
  demo.undockSample(); demo.setSnap(snap); st.group.position.x = gx
  const outsized = Object.values(st.reagents || {}).map((r) => r.grp)
    .filter((g) => g && g.parent === st.group && subjArea > 0 && frontArea(solidBox(g, st.group)) > subjArea)
  if (!outsized.length) return
  for (const g of outsized) { g.userData.used = false; g.userData.noFrame = true; g.userData.offFrame = true }
  if (st.backRow) { st.backRow = st.backRow.filter((g) => !g.userData.offFrame); demo.layoutBackRow(st) }
  st.enter?.()
}

export function configureStation(st, o) {
  configureStationCore(st, o)
  stageSources(st)
  addBenchStands(st)
}
function configureStationCore(st, o) {
  const { action, equipment, container, prevContainer, color, name, vol, seconds, startColor, startLevel, endColor, endLevel, cycles } = o
  const C = containerContract(container)
  const vessel = C.vessel
  const S = demo.getSample()
  const FLAT = C.flat
  const SEAT_Y = 0 // every vessel's origin is its base centre: on the bench it is at y=0
  const V = S[vessel], VU = V.userData, VD = dims(C.spec)
  // where a pipette delivers into THIS vessel and how deep its tip goes — facts of the built
  // vessel (its builder derives them from dimensions.json), never typed per container
  const MOUTH = VU.mouth || { x: 0, y: VD.height, z: 0, approach: 'top' }
  const ENTRY = VU.entry
  const LIFT = clearance('lift'), GAP = clearance('bench_gap')
  st.subjectFoot = { hw: VD.width / 2, hd: VD.depth / 2 }
  st.subjectH = VD.height
  st.socketErrors = st.socketErrors || []

  // seat the travelling sample on the BENCH at (x, z) WITHOUT resetting its contents: it
  // enters at the carried-in (start) state, continuing from where the last step left it.
  const seat = (x, z = 0) => {
    S.only(vessel)
    const v = S[vessel]
    if (name) v.userData.setLabel(name, vol || '')
    v.userData.setColor(startColor)
    v.userData.setLevel(startLevel)
    if (v.userData.setCap) v.userData.setCap(true) // a capped vessel arrives SEALED; a pour opens it
    v.visible = true
    v.rotation.set(0, 0, 0)
    v.scale.setScalar(1)
    v.userData.held = false
    S.at(v, st.x + x, 0, z)
    placeOnBench(v)
    return v
  }
  // put the sample INTO host's socket (it stays scene-parented; it glides to the pose)
  const seatIn = (host, sock) => {
    const v = S[vessel]
    const pose = placeInto(v, host, sock, { frame: st.group })
    S.at(v, st.x + pose.position.x, pose.position.y, pose.position.z)
    v.quaternion.copy(pose.quaternion)
    v.userData.held = false
    return pose
  }
  // does the sample's vessel fit the socket? A rejection is an ERROR, recorded, not drawn
  const fitsSocket = (host, sock) => {
    if (canPlace(V, host, sock)) return true
    const e = { vessel: VU.spec, host: host.userData.spec, socket: sock }
    st.socketErrors.push(e)
    console.error(`[benchpilot] ${e.vessel} does not fit ${e.host} socket "${sock}" — it stays on the bench beside it (step ${name || ''}).`)
    return false
  }
  const socketY = (host, sock) => socketPose(getSocket(host, sock), st.group).position
  // ON ICE: an ice pan (crushed ice, visible) with ONE cooling rack standing in it; the
  // reaction's seat 'rx' at the station origin. Returns null if the vessel has no seat there.
  const onIceRack = () => {
    const rack = demo.buildCoolRack()
    if (!canPlace(V, rack, 'rx')) return null
    const pan = demo.buildIcePan()
    st.group.add(pan); placeOnBench(pan)
    const bed = pan.userData.sockets.bed.position, rx = rack.userData.sockets.rx.position
    pan.position.set(-(bed.x + rx.x), 0, -(bed.z + rx.z))
    st.group.add(rack); st.group.updateMatrixWorld(true)
    const pose = placeInto(rack, pan, 'bed', { frame: st.group }); rack.position.copy(pose.position)
    st.group.updateMatrixWorld(true)
    rack.userData.setCutaway(true)   // CUTAWAY: the reaction is seen in its seat through the strip in front of it
    st.rack = rack
    // THE ICE IS SEEN: from the rail's 13° the pan's front wall hid the bed and only the
    // pieces at the frame's edge showed. A higher view (29°) looks down onto the ice packed
    // round the rack, over the rack's front — not through the ice to the tube — and the frame
    // takes in the ice bed in front of the reaction's seat
    st.viewDir = viewDir(0, 0.5)
    // …and the frame reaches the ice just in front of the rack, in line with the seat (at the
    // origin): its top, a piece out — the pan's front wall as anchor shrank the tube under
    // the 3 % legibility floor
    const rb = solidBox(rack, st.group), ice = dims('ice_pan')
    st.frameAnchors = [...(st.frameAnchors || []), new Vector3(0, ice.wall + ice.ice_depth, rb.max.z + ice.ice_piece)]
    return { rack, pan, seatY: socketY(rack, 'rx').y }
  }

  // evolve the sample's level (and, past the midpoint, its colour) from the carried-in
  // start toward this step's end, paced by p. Returns the base level.
  const evolve = (p) => {
    const v = S[vessel]
    const base = demo.lerp(startLevel, endLevel, demo.easeInOut(demo.clamp(p, 0, 1)))
    v.userData.setLevel(base)
    if (p > 0.5) v.userData.setColor(endColor)
    return base
  }
  // an instrument as the station SUBJECT: on the bench at the origin
  const subject = (dev) => { st.group.add(dev); placeOnBench(dev); st.updatables.push(dev); return dev }

  // where an add draws from: the sample's own TUBE when the reagent is the sample, nothing
  // when the step collects samples from outside the bench, else the reagent's bottle
  const source = (action === 'pour_add' || action === 'pipette_mix')
    ? addSource({ text_en: o.text, reagents: (o.reagents || []).map((r) => ({ name: r.name })) }) : 'bottle'
  const pour = action === 'pour_add' ? pourPlan({ text_en: o.text, reagents: (o.reagents || []).map((r) => ({ volume: r.vol })) }) : null
  if (action === 'pour_add' && source === 'none') {
    // COLLECTING samples: the sample arrives from outside the bench (a blood draw) — no
    // bottle and no pipette are invented; the vessel simply receives it
    st.enter = () => seat(0)
    st.timeline = (p) => { evolve(demo.easeInOut(demo.clamp((p - 0.2) / 0.6, 0, 1))) }
  } else if (source === 'sample_tube') {
    // the reagent IS the sample (e.g. "load the denatured protein samples into the wells"):
    // the pipette draws from the samples' own TUBE — a bottle of samples would be invented
    demo.stationReagent(st, SEAT_Y, { key: 'r', blabel: '', color: endColor, vessel, vlabel: name || '', vsub: vol || '', cStart: startColor, cEnd: endColor, lStart: startLevel, lEnd: endLevel, dispense: MOUTH, entry: ENTRY, rname: (o.reagents && o.reagents[0] && o.reagents[0].name) || '' })
    // the samples' own tube REPLACES the invented reagent source (not staged at all)
    const old = st.reagents.r.grp
    st.group.remove(old); st.backRow = (st.backRow || []).filter((o) => o !== old)
    const tube = demo.buildTube({ color: endColor, label: '' })
    tube.userData.noFrame = true
    tube.userData.setLevel?.(0.6)
    demo.backRowPlace(st, tube)
    if (tube.userData.update) st.updatables.push(tube)
    st.reagents.r = { grp: tube, get pos() { return tube.position.clone().setY(tube.userData.entry) } }
    const baseTl = st.timeline
    st.timeline = (p) => { baseTl(p); tube.userData.setLevel?.(demo.lerp(0.6, 0.4, demo.clamp(p / 0.3, 0, 1))) }
  } else if (pour && pour.pour) {
    // #13 — a POUR: the stated mL reagent's BOTTLE is tipped into the vessel; no pipette.
    // A pour that states no reagent names no bottle, so none is invented: the vessel fills.
    const mouth = { x: MOUTH.x || 0, z: MOUTH.z || 0, y: MOUTH.y }
    const reag = pour.reagentIndex >= 0 ? o.reagents[pour.reagentIndex] : null
    let bottle = null, cap = null, stream = null
    const BD = dims('bottle_250')
    const H = BD.height, TH = 1.9                              // bottle height (real), pour tilt (rad)
    const M = { x: mouth.x, y: mouth.y + LIFT, z: mouth.z }    // the bottle's mouth pours from just above
    const tiltBase = { x: M.x + H * Math.sin(TH), y: M.y - H * Math.cos(TH), z: M.z }
    // the POUR HEIGHT (mouth above the vessel): framing raises it until the tipped bottle is
    // out of frame and only its stream comes in (st.pour.setLift) — poured from just above,
    // a 250 mL bottle was the whole picture over a slide
    let pourLift = LIFT
    const setLift = (L) => {
      pourLift = L; M.y = mouth.y + L
      tiltBase.x = M.x + H * Math.sin(TH); tiltBase.y = M.y - H * Math.cos(TH)
      if (stream) { stream.scale.y = L / LIFT; stream.position.set(M.x, M.y - L / 2, M.z) }
    }
    let HOME = null, CAP_ON = null, CAP_BENCH = null
    // HOME is the bottle's own (userData.home): framing may set an out-sized bottle down out
    // of frame after this, and the pour then starts and ends there
    const homeOf = () => { HOME = bottle.userData.home; CAP_ON = { x: HOME.x, y: bottle.userData.capOnY, z: HOME.z }; CAP_BENCH = { x: HOME.x, y: bottle.userData.capHalfH, z: HOME.z - (BD.radius + GAP + BD.neck_diameter / 2) } }
    if (reag) {
      bottle = demo.addBottle(st, 'pour', reag.name, reag.color, reag.vol)
      // the bottle's cap comes OFF before the pour and is set down on the bench IN FRONT
      // of the bottle (the bottle's own cap follows its tilt, so it is hidden and this
      // identical cap — starting exactly on the neck — carries its role)
      cap = bottle.userData.cap.clone()
      cap.scale.copy(bottle.userData.capWorldScale)
      bottle.userData.cap.visible = false
      st.group.add(cap)
      bottle.userData.home = bottle.position.clone()
      homeOf()                                                     // the cap is set down BEHIND it: the subject is in front
      const sr = BD.neck_diameter * 0.12
      stream = new Mesh(new CylinderGeometry(sr * 0.7, sr, LIFT, 12), new MeshStandardMaterial({ color: reag.color, roughness: 0.3, transparent: true, opacity: 0.8 }))
      stream.position.set(M.x, M.y - LIFT / 2, M.z); stream.visible = false
      stream.userData.fx = 'effect' // a pour stream is not a solid (geometry audit)
      st.group.add(stream)
      st.pour = { bottle, setLift, lift: () => pourLift, pose: 0.65 }
    }
    st.enter = () => {
      seat(0)
      if (bottle) { homeOf(); bottle.position.copy(HOME); bottle.rotation.set(0, 0, 0); cap.position.set(CAP_ON.x, CAP_ON.y, CAP_ON.z) }
    }
    st.timeline = (p) => {
      const v = S[vessel]
      const seg = (a, b) => demo.easeInOut(demo.clamp((p - a) / (b - a), 0, 1))
      if (v.userData.setCap) v.userData.setCap(!(p > 0.2 && p < 0.95)) // a capped vessel opens for the pour
      if (!bottle) { evolve(seg(0.2, 0.85)); return }
      homeOf()
      // 0-0.1 · uncap: the cap lifts off the neck, carries over, and is set on the bench
      if (p < 0.03) cap.position.set(CAP_ON.x, demo.lerp(CAP_ON.y, CAP_ON.y + LIFT, seg(0, 0.03)), CAP_ON.z)
      else if (p < 0.07) { const q = seg(0.03, 0.07); cap.position.set(demo.lerp(CAP_ON.x, CAP_BENCH.x, q), CAP_ON.y + LIFT, demo.lerp(CAP_ON.z, CAP_BENCH.z, q)) }
      else cap.position.set(CAP_BENCH.x, demo.lerp(CAP_ON.y + LIFT, CAP_BENCH.y, seg(0.07, 0.1)), CAP_BENCH.z)
      const UP = Math.max(tiltBase.y, 0) + H + LIFT            // carried clear of the vessel (tiltBase.y follows the pour height)
      let x = HOME.x, y = HOME.y, z = HOME.z, rot = 0
      if (p < 0.1) { /* bottle waits while it is uncapped */ }
      else if (p < 0.16) { y = demo.lerp(HOME.y, UP, seg(0.1, 0.16)) }                  // straight up
      else if (p < 0.32) { const q = seg(0.16, 0.32); x = demo.lerp(HOME.x, tiltBase.x, q); z = demo.lerp(HOME.z, tiltBase.z, q); y = UP }
      else if (p < 0.38) { x = tiltBase.x; z = tiltBase.z; y = demo.lerp(UP, tiltBase.y, seg(0.32, 0.38)) }
      else if (p < 0.5) { x = tiltBase.x; y = tiltBase.y; z = tiltBase.z; rot = TH * seg(0.38, 0.5) }   // tip over
      else if (p < 0.8) { x = tiltBase.x; y = tiltBase.y; z = tiltBase.z; rot = TH }                    // pour
      else if (p < 0.88) { x = tiltBase.x; y = tiltBase.y; z = tiltBase.z; rot = TH * (1 - seg(0.8, 0.88)) }
      else { const q = seg(0.88, 1); x = demo.lerp(tiltBase.x, HOME.x, q); z = demo.lerp(tiltBase.z, HOME.z, q); y = demo.lerp(tiltBase.y, HOME.y, q) }
      bottle.position.set(x, y, z); bottle.rotation.set(0, 0, rot)
      bottle.userData.held = p > 0.1 && p < 0.999 // in hand while lifted/poured (geometry audit: not resting)
      cap.userData.held = p > 0.0 && p < 0.1
      bottle.userData.setLevel?.(1 - 0.3 * seg(0.5, 0.8))      // the bottle empties as it pours
      stream.visible = p >= 0.5 && p < 0.8
      evolve(seg(0.5, 0.8))                                     // fills only while it pours
    }
  } else if (action === 'pour_add') {
    const reags = o.reagents || []
    // draws FROM a prepared mixture ("apply the DNase I mixture …") → the source is the
    // tube you made, not a bottle from nowhere. The parsed `draws_from` is authoritative;
    // the name heuristic is a fallback for data parsed before Stage 34.
    const fromMix = reags.length === 1 && (!!o.drawsFrom
      || /\bmix\b|mixture|master ?mix|working solution/i.test(reags[0].name || ''))
    const prep = (fromMix && o.drawsFrom) ? demo.getPrep(o.drawsFrom) : null
    if (reags.length <= 1 && !fromMix) {
      // single-reagent path: resident pipette rig + bottle; fill ramps in the dispense window.
      demo.stationReagent(st, SEAT_Y, { key: 'r', blabel: '', color: endColor, vessel, vlabel: name || '', vsub: vol || '', cStart: startColor, cEnd: endColor, lStart: startLevel, lEnd: endLevel, dispense: MOUTH, entry: ENTRY, rname: (o.reagents && o.reagents[0] && o.reagents[0].name) || '' })
    } else if (prep) {
      // DRAW FROM THE CARRIED MIX (Stage 36). The prep tube made at its own station is
      // glided HERE to a bench slot on the right; the pipette draws OUT of it.
      const disp = MOUTH
      const toY = disp.approach === 'angled' ? disp.y : SEAT_Y
      const T = dims(prep.userData.spec)
      demo.addPipetteRig(st)
      // the carried tube parks in the BACK ROW, behind the subject (beside it, it hid part of it)
      const dx = 0, dz = -(VD.depth / 2 + GAP + T.depth / 2)
      const draw = { x: dx, y: prep.userData.entry, z: dz }   // the tip goes into the parked tube
      st.drawFrom = new Vector3(draw.x, draw.y, draw.z)       // the pipette is held over it at rest
      const streamColor = prep.userData.mixColor != null ? prep.userData.mixColor : reags[0].color
      const PREP_FULL = 0.62
      st.drawsFromId = o.drawsFrom
      st.drawPos = { x: st.x + dx, y: 0, z: dz } // WORLD seat the carried tube glides to
      st.frameAnchors = [new Vector3(dx - T.width / 2, 0, dz - T.depth / 2), new Vector3(dx + T.width / 2, T.height, dz + T.depth / 2)] // a used source: in frame
      st.enter = () => { seat(0); demo.pipRest(st); prep.userData.setLevel(PREP_FULL) }
      st.timeline = (p) => {
        const v = S[vessel]
        if (v.userData.setCap) v.userData.setCap(!(p > 0.1 && p < 0.95)) // uncap to receive
        demo.pipetteRun(st, new Vector3(draw.x, draw.y, draw.z), { x: disp.x, y: toY, z: disp.z }, p,
          { color: streamColor, fill: 0.8, approach: disp.approach, tilt: disp.tilt, depth: disp.depth, standoff: disp.standoff, dipDepth: ENTRY })
        const done = demo.dispenseProgress(p)
        v.userData.setLevel(demo.lerp(startLevel, endLevel, done))
        v.userData.setColor(endColor)
        prep.userData.setLevel(demo.lerp(PREP_FULL, 0.1, demo.easeInOut(demo.clamp(p, 0, 1)))) // drained as used
      }
    } else {
      // N reagents → N pipette passes INTO the sample (one per reagent, from its own source).
      const disp = MOUTH
      demo.addPipetteRig(st)
      reags.forEach((r, k) => addReagentSource(st, 'r' + k, r, k, fromMix))
      // ASSEMBLED ON ICE from µl reagents (a PCR set-up): ONE pre-chilled rack holds the
      // reaction (its 'rx' seat, at the station origin) and every reagent tube (a row of
      // 1.5 mL seats along it) — the stated ice, and one rack, not a stand per tube
      const tubes = reags.map((r, k) => st.reagents['r' + k].grp)
      let rack = null, seatY = SEAT_Y
      if (o.onIce && tubes.every((g) => g.userData.spec === 'microtube_1_5') && tubes.length <= dims('cool_rack').seats_1_5) {
        const ice = onIceRack()
        if (ice) {
          rack = ice.rack; seatY = ice.seatY
          st.backRow = (st.backRow || []).filter((g) => !tubes.includes(g))
          tubes.forEach((g, k) => { const pose = placeInto(g, rack, rack.userData.sourceSockets[k], { frame: st.group }); g.position.copy(pose.position) })
        }
      }
      const toY = disp.approach === 'angled' ? disp.y : seatY
      st.enter = () => { seat(0); if (rack) seatIn(rack, 'rx'); demo.pipRest(st) }
      st.timeline = (p) => {
        const v = S[vessel]
        if (v.userData.setCap) v.userData.setCap(!(p > 0.1 && p < 0.95)) // uncap for the passes
        const n = reags.length, seg = 1 / n
        const k = Math.min(n - 1, Math.floor(p / seg))
        const lp = demo.clamp((p - k * seg) / seg, 0, 1)
        const src = st.reagents['r' + k].grp
        if (src.userData.setCap) src.userData.setCap(!(lp > 0.03 && lp < 0.36))
        demo.pipetteRun(st, st.reagents['r' + k].pos, { x: disp.x, y: toY, z: disp.z }, lp,
          { color: reags[k].color, fill: demo.tipFill(reags[k].vol), approach: disp.approach, tilt: disp.tilt, depth: disp.depth, standoff: disp.standoff, dipDepth: ENTRY })
        const done = (k + demo.dispenseProgress(lp)) / n
        v.userData.setLevel(demo.lerp(startLevel, endLevel, done))
        v.userData.setColor(reags[Math.min(k, n - 1)].color)
      }
    }
  } else if (action === 'prepare') {
    // NOT EVERY STEP HAPPENS TO THE SAMPLE. Combine the reagents in a SEPARATE vessel (the
    // subject, at the origin); the SAMPLE waits on the bench to its left, untouched. The prep
    // vessel is a SECOND TRAVELLING OBJECT (Stage 36): built ONCE, carried later.
    const reags = (o.reagents && o.reagents.length) ? o.reagents : [{ name, vol, color: endColor }]
    const prepId = o.produces || ('prep_' + Math.round(st.x))
    const PREP_FULL = 0.62
    const prep = demo.makePrep(prepId, {})
    const PD = dims(prep.userData.spec)
    st.subjectFoot = { hw: PD.width / 2 }
    st.subjectH = PD.height
    const home = { x: st.x, y: 0, z: 0 }
    prep.position.set(home.x, home.y, home.z); prep.userData.tPos.copy(prep.position); placeOnBench(prep)
    prep.userData.mixColor = reags[reags.length - 1].color // the mixture's settled colour
    prep.userData.setColor(reags[0].color); prep.userData.setLevel(0)
    if (prep.userData.label) prep.userData.label.visible = false   // the station title names it (its own plate was world-sized)
    st.prep = prep; st.prepId = prepId; st.prepHome = home; st.prepFull = PREP_FULL
    st.subject = () => prep // the step acts on the PREP tube, not the idle sample
    demo.addPipetteRig(st)
    reags.forEach((r, k) => demo.addBottle(st, 'r' + k, r.name, r.color, r.vol))
    // STAGE ONLY WHAT THE STEP USES: a prepare does not touch the sample, so the sample is
    // not staged here (framed beside the prep it cost the prep its legibility); it is shown
    // again, unchanged, at the next station
    const DIP = { x: 0, y: SEAT_Y, z: 0 }
    const idleSample = () => {
      S.only(vessel)
      const sv = S[vessel]
      sv.userData.setColor(startColor); sv.userData.setLevel(startLevel)
      sv.visible = false; sv.rotation.set(0, 0, 0); sv.scale.setScalar(1); sv.userData.held = false
      S.snapTo(sv, st.x, 0, 0) // (hidden) held here, so it glides on from this station; never clobber global snap
      placeOnBench(sv)
      return sv
    }
    st.enter = () => { idleSample(); prep.userData.setLevel(0); prep.userData.setColor(reags[0].color); demo.pipRest(st) }
    st.timeline = (p) => {
      const sv = S[vessel]
      sv.userData.setColor(startColor); sv.userData.setLevel(startLevel) // untouched, held
      const n = reags.length, seg = 1 / n
      const k = Math.min(n - 1, Math.floor(p / seg))
      const lp = demo.clamp((p - k * seg) / seg, 0, 1)
      const b = st.reagents['r' + k].grp
      if (b.userData.setCap) b.userData.setCap(!(lp > 0.03 && lp < 0.36))
      demo.pipetteRun(st, st.reagents['r' + k].pos, DIP, lp, { color: reags[k].color, fill: 0.8, dipDepth: prep.userData.entry })
      const done = (k + demo.dispenseProgress(lp)) / n
      prep.userData.setLevel(done * PREP_FULL)
      prep.userData.setColor(reags[Math.min(k, n - 1)].color)
    }
  } else if (action === 'pipette_mix') {
    // resuspend / mix by pipetting: the pipette bobs STRAIGHT down into the vessel's mouth
    // and back — tip raised just clear of the mouth, plunged to the vessel's entry depth.
    // CONTINUITY: a reaction assembled on ice is mixed where it was assembled — in its seat in
    // the cooling rack, on the ice (it used to jump to an acrylic stand)
    const ice = (o.onIce || o.prevOnIce) ? onIceRack() : null
    const Y0 = ice ? ice.seatY : 0
    const TOP = Y0 + MOUTH.y + LIFT
    const BOT = Y0 + ENTRY
    demo.addPipetteRig(st)
    st.enter = () => { seat(0); if (ice) seatIn(ice.rack, 'rx'); if (st.pip) { st.pip.position.set(MOUTH.x, TOP, MOUTH.z); st.pip.userData.setFluid(0) } }
    st.timeline = (p) => {
      const pip = st.pip
      if (pip) {
        const cp = (p * 3) % 1 // 3 mixing strokes
        const dip = Math.sin(cp * Math.PI) // 0→1→0, CONTINUOUS across the reset (no jump)
        pip.position.set(MOUTH.x, demo.lerp(TOP, BOT, dip), MOUTH.z)
        pip.userData.setColor(endColor)
        pip.userData.setFluid((1 - dip) * demo.tipFill(vol)) // draw up when raised, expel when plunged (the step states no mix volume: a small draw)
      }
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 26) * 0.02) // surface ripple over carried level
    }
  } else if (action === 'vortex_mix') {
    if (FLAT) {
      // A FLAT vessel can't press into a tube vortexer, and TILTING one dips a corner
      // THROUGH THE FLOOR. Agitate it in place: a tight in-plane orbital jiggle on the bench.
      const A = VD.width * 0.02
      st.enter = () => seat(0)
      st.timeline = (p) => {
        const v = S[vessel]
        evolve(p)
        v.rotation.set(0, 0, 0)
        const a = p * 40
        S.at(v, st.x + Math.cos(a) * A, 0, Math.sin(a) * A)
      }
    } else {
      // a real VORTEX MIXER; the tube presses onto its rubber cup (socket) and shakes.
      const mixer = subject(demo.buildVortexMixer())
      const SOCK = mixer.userData.sampleSocket
      const ok = fitsSocket(mixer, SOCK)
      const benchX = ok ? 0 : demo.benchSlot(st, VD.width / 2, +1)
      st.enter = () => { seat(benchX); if (ok) seatIn(mixer, SOCK) }
      st.timeline = (p) => {
        const v = S[vessel]
        evolve(p)
        if (!ok) return
        v.rotation.z = Math.sin(p * 46) * 0.16 // rapid orbital wobble about its base in the cup
        v.rotation.x = Math.cos(p * 46) * 0.08
      }
    }
  } else if (action === 'homogenize') {
    // MANUAL homogenization: a syringe's needle goes in through the tube's MOUTH to the
    // lysate and the plunger pumps (pass through a 20–21 G needle). Real size, held nearly
    // upright so the needle clears the rim.
    const syr = demo.buildSyringe()
    syr.userData.setColor(endColor)
    syr.userData.offBench = true
    syr.position.set(MOUTH.x, ENTRY, MOUTH.z)       // the needle TIP in the liquid
    syr.rotation.z = -0.06
    st.group.add(syr)
    st.updatables.push(syr)
    st.enter = () => seat(0)
    st.timeline = (p) => {
      const passes = 5 // "pass 5 times through the needle"
      const cp = (p * passes) % 1
      syr.userData.setPlunge(cp < 0.5 ? cp * 2 : (1 - cp) * 2) // press down then draw up
      syr.userData.setColor(endColor)
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 34) * 0.02) // agitation ripple over carried level
    }
  } else if (action === 'discard') {
    // remove liquid — motion follows the CURRENT container: a tube TIPS into the waste; a
    // plate/dish/membrane is ASPIRATED (never tipped). The step's own "aspirate" makes
    // even a tube a pipette removal (#14).
    if (removalFor(container, o.text) === 'aspirate') {
      const dx = MOUTH.x, dz = MOUTH.z
      const hiY = MOUTH.y + LIFT
      const loY = ENTRY
      // a CANTED NECK (a flask) is entered ALONG its axis, tilted to its cant — as pipetteRun's
      // angled approach does. (Straight down, `ENTRY` was undefined: the tip's height was NaN
      // and the pipette never rendered; at the mouth, its body went through the flask.)
      const angled = MOUTH.approach === 'angled'
      const TILT = MOUTH.tilt != null ? MOUTH.tilt : -0.62, ax = Math.sin(-TILT), ay = Math.cos(-TILT)
      const dTop = MOUTH.standoff != null ? MOUTH.standoff : (MOUTH.depth || 0), depth = MOUTH.depth || 0
      const tipAt = (q) => {
        if (!angled) { st.pip.position.set(dx, demo.lerp(hiY, loY, q), dz); st.pip.rotation.set(0, 0, 0); return }
        if (q < 0.4) { const k = q / 0.4; st.pip.position.set(dx + ax * dTop, demo.lerp(hiY, MOUTH.y + ay * dTop, k), dz); st.pip.rotation.set(0, 0, TILT * k) }
        else { const d = demo.lerp(dTop, -depth, (q - 0.4) / 0.6); st.pip.position.set(dx + ax * d, MOUTH.y + ay * d, dz); st.pip.rotation.set(0, 0, TILT) }
      }
      demo.addPipetteRig(st)
      st.enter = () => { seat(0); if (st.pip) { tipAt(0); st.pip.userData.setFluid(0) } }
      st.timeline = (p) => {
        // a CAPPED vessel (a flask) opens before the tip reaches its neck — a tip through a
        // closed cap is the same lie as through glass
        const v = S[vessel]; if (v.userData.setCap) v.userData.setCap(!(p > 0.1 && p < 0.95))
        if (st.pip) {
          // in (0–0.45), aspirate (0.45–0.75), OUT (0.75–0.92) before the cap goes back on — the
          // tip used to stay in the neck to the end, and the cap closed through it
          tipAt(p < 0.45 ? demo.easeInOut(p / 0.45) : p < 0.75 ? 1 : demo.easeInOut(1 - demo.clamp((p - 0.75) / 0.17, 0, 1)))
          st.pip.userData.setColor(endColor)
          st.pip.userData.setFluid(demo.easeInOut(demo.clamp(p, 0, 1)) * 0.7)
        }
        evolve(p) // drain (no tipping)
      }
    } else {
      // the WASTE beaker stands on the bench to the right; the tube is picked up off the
      // bench, carried over the beaker, TIPPED so its mouth is over the beaker's mouth, and
      // put back — never hanging in the air at rest.
      const waste = demo.buildWaste()
      demo.benchPlace(st, waste, +1)
      st.updatables.push(waste)
      const WD = dims('beaker_600')
      const TIP = 1.2
      const up = { x: MOUTH.y * Math.sin(TIP), y: MOUTH.y * Math.cos(TIP) } // mouth offset when tipped
      const over = { x: waste.position.x - up.x, y: WD.height + LIFT - up.y }
      const carryY = WD.height + VD.height + LIFT
      st.enter = () => seat(0)
      st.timeline = (p) => {
        const v = S[vessel]
        const seg = (a, b) => demo.easeInOut(demo.clamp((p - a) / (b - a), 0, 1))
        let x = 0, y = 0, rot = 0
        if (p < 0.15) { y = carryY * seg(0, 0.15) }
        else if (p < 0.35) { x = over.x * seg(0.15, 0.35); y = demo.lerp(carryY, over.y, seg(0.15, 0.35)) }
        else if (p < 0.75) { x = over.x; y = over.y; rot = -TIP * seg(0.35, 0.5) * (1 - seg(0.65, 0.75)) }
        else if (p < 0.9) { x = over.x * (1 - seg(0.75, 0.9)); y = demo.lerp(over.y, carryY, seg(0.75, 0.9)) }
        else { y = carryY * (1 - seg(0.9, 1)) }
        S.at(v, st.x + x, y, 0); v.rotation.set(0, 0, rot)
        v.userData.held = p > 0.001 && p < 0.999
        if (v.userData.held) clearPlacement(v); else placeOnBench(v)
        evolve(demo.clamp((p - 0.4) / 0.3, 0, 1)) // drains only while tipped over the beaker
      }
    }
  } else if (action === 'transfer') {
    // A transfer moves the sample from container A (prev) into B (this step). TWO kinds,
    // told apart by the CONTRACT (nestsInto), never by a hardcoded pair.
    const prevC2 = prevContainer ? containerContract(prevContainer) : null
    const kind = transferKind(prevContainer, container) // 'nest' | 'contents' | 'rest' | 'place'
    if (kind === 'nest' && prevC2) {
      configureNestMove(st, S, { columnKey: prevC2.vessel, tubeKey: vessel, color: startColor, level: startLevel })
      st._skipHandoff = true
    } else if (kind === 'contents' && prevC2) {
      configurePipetteTransfer(st, S, {
        fromKey: prevC2.vessel, toKey: vessel,
        srcDisp: S[prevC2.vessel].userData.mouth, srcEntry: S[prevC2.vessel].userData.entry, dstDisp: MOUTH, dstEntry: ENTRY,
        srcToken: prevContainer, dstToken: container,
        color: endColor, startLevel, endLevel, name, vol,
      })
      st._skipHandoff = true
    } else if (kind === 'place' && prevC2) {
      // A gel or membrane on either side (#5): nothing is pipetted. Both rest side by side,
      // spaced by their REAL footprints; the destination takes on the carried contents.
      const { AX, BX, srcFoot, dstFoot } = sideBySide(prevContainer, container)
      const hA = dims(prevC2.spec).height
      st.benchReserved = [{ minX: AX + srcFoot.minX, maxX: AX + srcFoot.maxX }, { minX: BX + dstFoot.minX, maxX: BX + dstFoot.maxX }]
      st.frameAnchors = [
        new Vector3(AX + srcFoot.minX, 0, 0), new Vector3(AX + srcFoot.maxX, hA, 0),
        new Vector3(BX + dstFoot.minX, 0, 0), new Vector3(BX + dstFoot.maxX, VD.height, 0),
      ]
      st.enter = () => {
        S.only(vessel)
        const a = S[prevC2.vessel], b = S[vessel]
        a.visible = true; b.visible = true
        a.rotation.set(0, 0, 0); b.rotation.set(0, 0, 0)
        a.userData.setColor?.(startColor); a.userData.setLevel?.(startLevel)
        b.userData.setColor?.(endColor); b.userData.setLevel?.(0)
        S.snapTo(a, st.x + AX, 0, 0); placeOnBench(a)
        S.snapTo(b, st.x + BX, 0, 0); placeOnBench(b)
      }
      st.timeline = (p) => {
        const b = S[vessel]
        S[prevC2.vessel].visible = true
        b.userData.setColor?.(endColor)
        b.userData.setLevel?.(demo.lerp(0, endLevel, demo.easeInOut(demo.clamp((p - 0.2) / 0.6, 0, 1))))
      }
      st._skipHandoff = true
    } else {
      // NEITHER a nest NOR a container change: an ADD wearing a transfer's name — surface it
      // loudly and rest (never a fill).
      console.warn(`[benchpilot] transfer step ${name || ''} did not resolve to a nest or a ` +
        `container move (prev=${prevContainer}, to=${container}) — rendering a rest, not a fill. ` +
        `If this should MOVE the sample, its container/nestsIn contract is wrong.`)
      st.enter = () => seat(0)
      st.timeline = () => { S[vessel].userData.setLevel(startLevel) } // hold — never fill on a transfer
    }
  } else if (equipment === 'centrifuge' || action === 'elute') {
    // benchtop centrifuge: the sample goes INTO a rotor slot socket and rides the rotor.
    demo.stationSpin(st, SEAT_Y, { vessel, vlabel: name || '', vsub: vol || '', color: endColor, lStart: startLevel, lEnd: endLevel, cenLabel: 'Centrifuge', cenSub: vol || '', seconds, rcf: o.rcf })
  } else if ((action === 'incubate_wait' && equipment !== 'ice_bucket') || (action === 'store' && equipment === 'co2_incubator')) {
    // EQUIPMENT CONTRACT: the instrument was resolved from the container AND the step's
    // stated conditions (resolveRecipe) — anything else is the bench (never a wrong
    // instrument). The sample goes INTO the instrument's socket.
    const inst = equipment
    const incubating = action === 'incubate_wait'
    let dev = null, motionFn = null
    if (inst === 'plate_shaker') {
      dev = subject(demo.buildPlateShaker())
      // the plate RIDES the platform socket, so plate and platform orbit as one
      motionFn = (p) => { dev.userData.setOrbit(p * 40) }
    } else if (inst === 'co2_incubator') {
      dev = subject(demo.buildCO2Incubator())
      if (incubating) motionFn = (p) => { dev.userData.setDoor(p > 0.5) }
    } else if (inst === 'incubation_block') {
      dev = subject(demo.buildColdBlock())
    }
    const SOCK = dev ? dev.userData.sampleSocket : null
    const ok = dev ? fitsSocket(dev, SOCK) : false
    const benchX = dev && !ok ? demo.benchSlot(st, VD.width / 2, +1) : 0
    const ride = inst === 'plate_shaker'
    const place = () => {
      const v = S[vessel]
      if (!dev || !ok) return
      if (ride) { demo.getSample(); placeInto(v, dev, SOCK, { ride: true }); v.userData.docked = true; v.userData.exitY = dims(dev.userData.spec).height + VD.height + LIFT }
      else seatIn(dev, SOCK)
    }
    st.enter = () => { demo.undockSample(); seat(benchX); place(); const v = S[vessel]; if (v.userData.setMono) v.userData.setMono(1) }
    st.timeline = (p) => {
      const v = S[vessel]
      if (incubating && v.userData.setMono) v.userData.setMono(1 - demo.easeInOut(demo.clamp((p - 0.3) / 0.5, 0, 1)))
      v.userData.setLevel(evolve(p) + Math.sin(p * 10) * 0.02) // holds carried contents
      if (motionFn) motionFn(p)
    }
  } else if (action === 'heat' && equipment === 'water_bath') {
    // WATER BATH — the tube stands on the bath's submerged RACK (socket), ~60 % under water.
    const bath = demo.buildWaterBath()
    st.group.add(bath); st.updatables.push(bath)
    const BD = dims('water_bath_5l')
    st.warm = new PointLight(0xffb060, 0, BD.width * 0.5)
    st.group.add(st.warm)
    const SURF = bath.userData.surfaceY, IN = bath.userData.inner
    const ok = !FLAT && fitsSocket(bath, bath.userData.sampleSocket)
    if (ok) bath.userData.setCutaway?.(true)   // CUTAWAY: the tube is seen in place, in the water
    if (FLAT || !ok) {
      // a flat vessel (or one the rack doesn't take) rests on the bench IN FRONT; the bath behind it
      bath.position.set(0, 0, -(BD.depth / 2 + GAP + VD.depth / 2))
    }
    placeOnBench(bath)
    // the warm glow comes from the water behind the tube, not from the tube itself
    st.warm.position.set(bath.position.x, SURF + BD.inner_height * 0.4, bath.position.z - BD.inner_depth * 0.35)
    const R = dims('microtube_1_5').radius
    st.bubbles = streams.wrap('heatBubbles', () => Array.from({ length: 8 }, () => {
      const b = new Mesh(new SphereGeometry(R * 0.4, 10, 8), new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0.1 }))
      b.userData.seed = { x: (Math.random() - 0.5) * IN.w * 0.7, z: (Math.random() - 0.5) * IN.d * 0.6, off: Math.random(), sp: 0.5 + Math.random() }
      b.userData.fx = 'effect' // rising bubbles are not solids (geometry audit)
      st.group.add(b)
      return b
    }))()
    st.enter = () => { seat(0); if (ok) seatIn(bath, bath.userData.sampleSocket) }
    st.timeline = (p) => {
      st.warm.intensity = p * 1.1 // gentle warmth near the vessel (no bench bloom)
      bath.userData.setWarmth?.(demo.clamp(p * 1.3, 0, 1))
      for (const b of st.bubbles) {
        const s = b.userData.seed
        const yy = (p * s.sp * 3 + s.off) % 1
        b.position.set(bath.position.x + s.x, SURF - yy * (SURF - 0) * 0.05, bath.position.z + s.z)
        b.scale.setScalar(0.4 + yy)
        b.visible = ok // bubbles only rise when a tube is in the water
      }
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 12) * 0.02) // holds carried contents
    }
  } else if (action === 'cool_ice' || equipment === 'ice_bucket') {
    // ice bucket: the tube stands on the bucket FLOOR (socket), packed round with ice.
    const ice = subject(demo.buildIceBucket())
    st.dev = ice                                  // the step's instrument (the tube may stand beside it, arriving)
    st.cold = new PointLight(0x5fb8f0, 0, dims('ice_bucket_4l').diameter * 2)
    st.cold.position.set(0, dims('ice_bucket_4l').height + LIFT, 0)
    st.group.add(st.cold)
    const SOCK = ice.userData.sampleSocket
    const ok = fitsSocket(ice, SOCK)
    if (ok) ice.userData.setCutaway?.(true)   // CUTAWAY: the tube is seen in place, in the ice
    const benchX = ok ? 0 : demo.benchSlot(st, VD.width / 2, +1)
    // ONTO THE ICE: a tube arriving from a station where it was not on ice is SET INTO the
    // ice here — from its stand beside the bucket, straight up clear of the rim, across,
    // straight down into its place (it used to start in the ice: it teleported there)
    const arrive = ok && prevContainer != null && !o.prevOnIce
    if (arrive) {
      const bx = demo.benchSlot(st, VD.width / 2, +1)
      const seatP = socketY(ice, SOCK), carryY = dims('ice_bucket_4l').height + LIFT
      const at = (x, y, z) => S.at(S[vessel], st.x + x, y, z)
      st.extraSpots = [...(st.extraSpots || []), { x: bx, z: 0, stand: demo.standFor(C.spec) }]
      st.enter = () => { seat(bx) }
      st.timeline = (p) => {
        const v = S[vessel], seg = (a, b) => demo.easeInOut(demo.clamp((p - a) / (b - a), 0, 1))
        v.userData.held = p >= 0.06 && p < 0.32
        if (p < 0.06) { seat(bx) }                                                                      // 1 · in its stand beside the ice
        else if (p < 0.14) { clearPlacement(v); at(bx, demo.lerp(0, carryY, seg(0.06, 0.14)), 0) }    // 2 · straight up, clear of the rim
        else if (p < 0.24) { clearPlacement(v); const q = seg(0.14, 0.24); at(demo.lerp(bx, seatP.x, q), carryY, demo.lerp(0, seatP.z, q)) } // 3 · over its place
        else if (p < 0.32) { clearPlacement(v); at(seatP.x, demo.lerp(carryY, seatP.y, seg(0.24, 0.32)), seatP.z) }                          // 4 · straight down into the ice
        else seatIn(ice, SOCK)                                                                          // 5 · on ice, and stays there
        st.cold.intensity = demo.clamp((p - 0.3) / 0.7, 0, 1) * 2.6
        evolve(p) // holds the carried contents
      }
    } else {
      st.enter = () => { seat(benchX); if (ok) seatIn(ice, SOCK) }
      st.timeline = (p) => {
        evolve(p) // holds the carried contents
        st.cold.intensity = p * 2.6 // cold cast ramps up (monotonic)
      }
    }
  } else if (action === 'thermocycle' || equipment === 'thermocycler') {
    // PCR: the sample goes into a block WELL socket; the lid closes. The cycled block shows
    // a live CYCLE n/N counter; a single-temperature PROGRAM step (initial denaturation,
    // final extension, the 4 °C hold) shows its own stated temperature and the time left on
    // the cycler's display — never a countdown ring on the bench. The 96-well block takes
    // 0.2 mL PCR tubes ONLY: any other vessel is a SocketError (recorded) and waits on the
    // bench beside the cycler.
    const tc = subject(demo.buildThermocycler())
    st.dev = tc
    const n = cycles > 0 ? cycles : 30
    const hold = action !== 'thermocycle'
    // THE LID STAYS DOWN BETWEEN PROGRAM STEPS: it opens only as the tube arrives (the step
    // before was not in the cycler) and before it leaves (the next one is not)
    const openAtStart = o.prevEquipment !== 'thermocycler', openAtEnd = o.nextEquipment !== 'thermocycler'
    const lidOpen = (p) => (p < 0.12 && openAtStart) || (p > 0.78 && openAtEnd)
    // the cycle's stated temperatures, in order (denature · anneal · extend)
    // …and each one's stated time ("94°C for 30 s", "72°C for 1 min per 1000 bp")
    const cyc = [...String(o.text || '').matchAll(/(-?\d+(?:\.\d+)?)\s*°\s*C(?:\s*for\s*(\d+(?:\.\d+)?)\s*(s|sec|min))?/g)].slice(0, 3)
    const temps = cyc.map((m) => +m[1])
    const durs = cyc.map((m) => (m[2] ? +m[2] * (m[3] === 'min' ? 60 : 1) : 0))
    const show = (p) => hold ? tc.userData.setHold('HOLD', o.tempC, seconds, p) : tc.userData.setProgress(p, n, temps, durs)
    const SOCK = tc.userData.sampleSocket
    const ok = fitsSocket(tc, SOCK)
    const benchX = ok ? 0 : demo.benchSlot(st, VD.width / 2, +1)
    if (ok) tc.userData.setCutaway?.(true)   // CUTAWAY: the tube is seen in its well, through the block's near wall
    // seated, the step acts on the tube THROUGH the cycler — its program on the display is
    // what the step shows: the cycler (tube in its front row, display) is the subject.
    // Framed alone, the 21 mm tube filled the frame and the display was never seen.
    if (ok) {
      // A THREE-QUARTER VIEW in which the lid, the block and the display read as ONE machine
      // (straight on, four stations were the same black box with a display, the tube a speck).
      // The step opens CLOSE on the tube being seated in its well, lid open (the first program
      // step), and ends close on it as the lid opens (the last); otherwise the whole machine.
      st.viewDir = viewDir(0.62, 0.44)
      const close = (p) => (p < 0.1 && openAtStart) || (p > 0.9 && openAtEnd)
      st.subjectAt = (p) => (close(p) ? S[vessel] : tc)
      st.frameBoxAt = (p) => {
        tc.updateMatrixWorld(true)
        // close: the tube and a few wells of block round it (it reads as seated IN the cycler)
        if (close(p)) { const b = solidBox(S[vessel]), w = dims('thermocycler_96').well_pitch * 1.5; return b.expandByVector(new Vector3(w, 0, w)) }
        // the machine as the step shows it: its FRONT QUARTER — the display (it carries every
        // stated value of the step), the block's front row with the tube in it, and the lid
        // edge above them; the rest of the lid and the deep body run out of the frame, still
        // one machine (framed whole, the display was 2.6 % of the frame)
        const b = new Box3().setFromObject(tc.userData.display).union(solidBox(S[vessel]))
        b.union(new Box3().setFromObject(tc.userData.blockParts[1]))
        return lidOpen(p) ? b.union(tc.userData.openLidBox()) : b
      }
      st.tightFrame = true
      st.instrumentFrame = true
    }
    const SEATED = ok ? socketY(tc, SOCK) : null, DROP = VD.height + LIFT
    st.enter = () => { seat(benchX); if (ok) seatIn(tc, SOCK); tc.userData.setLid(lidOpen(0)); show(0) }
    st.timeline = (p) => {
      // the first program step SEATS the tube: straight down into its well (0–0.08), lid open
      if (ok && openAtStart) {
        const v = S[vessel], k = demo.easeInOut(demo.clamp(p / 0.08, 0, 1))
        S.at(v, st.x + SEATED.x, SEATED.y + (1 - k) * DROP, SEATED.z)
        v.userData.held = k < 1
        if (k < 1) clearPlacement(v); else placeInto(v, tc, SOCK)
      }
      tc.userData.setLid(lidOpen(p))
      show(p)
      evolve(p) // contents unchanged; the tube just cycles temperature
    }
  } else if (action === 'electrophorese' && container === 'gel' && prevContainer && !containerContract(prevContainer).flat) {
    // "RUN 5 µl OF THE PRODUCT ON A GEL": the product is LOADED from its tube into a well —
    // the gel is already in the tank under buffer, lid off; the tube stands beside the tank.
    // The pipette draws from the tube and dispenses into the well; the lid goes on; it runs.
    // (A hand-off here lifted the tube away and conjured the gel — nothing was loaded.)
    // The power supply stands further off: at one bench gap the close-up cropped it into a
    // white wedge at the frame edge
    const rig = subject(demo.buildGelRig({ psuGap: clearance('bench_gap') * 4 }))
    st.dev = rig
    rig.userData.showGel(false)
    const tank = rig.userData.tank
    const SOCK = rig.userData.sampleSocket
    const ok = fitsSocket(tank, SOCK)
    if (ok) rig.userData.setCutaway?.(true)
    const src = containerContract(prevContainer).vessel
    const SD = dims(S[src].userData.spec)
    const TX = demo.benchSlot(st, SD.width / 2, +1)
    const DOCK = socketY(tank, SOCK)
    demo.addPipetteRig(st)
    st._skipHandoff = true
    const draw = () => new Vector3(TX, S[src].userData.entry, 0)
    const well = () => { const m = S[vessel].userData.mouth; return { x: DOCK.x + m.x, y: DOCK.y + m.y, z: DOCK.z + m.z } }
    st.drawFrom = draw()
    st.subjectAt = () => S[vessel]                     // the gel being loaded, then run
    st.cosubjects = () => [S[src]]                     // …from the product's tube
    // loading fills most of the step (the dispense is mid-step); then the lid, then the run
    const LOAD = 0.7, AWAY = 0.75, LID = 0.84
    st.enter = () => {
      S.only(vessel)
      const g = S[vessel]
      g.visible = true; g.rotation.set(0, 0, 0); g.userData.held = false
      g.userData.setColor?.(startColor); g.userData.setLevel?.(startLevel)
      S.at(g, st.x + DOCK.x, DOCK.y, DOCK.z)
      if (ok) placeInto(g, tank, SOCK); else placeOnBench(g)
      const t = S[src]
      t.visible = true; t.rotation.set(0, 0, 0); t.userData.held = false
      t.userData.setColor?.(startColor); t.userData.setLevel?.(startLevel)
      S.at(t, st.x + TX, 0, 0); placeOnBench(t)
      rig.userData.setLidLift(1, 1); rig.userData.setVolts(false)
      demo.pipRest(st)
    }
    st.timeline = (p) => {
      const seg = (a, b) => demo.easeInOut(demo.clamp((p - a) / (b - a), 0, 1))
      S[src].visible = true
      demo.pipetteRun(st, draw(), well(), Math.min(p / LOAD, 1), { color: startColor, fill: demo.tipFill(vol), dipDepth: 0 })
      if (p >= LOAD) {                                   // loaded: the pipette goes back over the tube, out of the lid's way
        const w = well(), cy = demo.cruiseY(st, draw(), w), r = demo.restPoint(st), e = seg(LOAD, AWAY)
        st.pip.position.set(demo.lerp(w.x, r.x, e), cy, demo.lerp(w.z, r.z, e))
      }
      if (p < AWAY) { rig.userData.setLidLift(1, 1); rig.userData.setVolts(false) }                    // lid off, set aside
      else if (p < LID) {                                                                             // lid (leads and all) back over, then down on
        const q = (p - AWAY) / (LID - AWAY)
        rig.userData.setLidLift(q < 0.5 ? 1 : 1 - demo.easeInOut((q - 0.5) / 0.5), q < 0.5 ? 1 - demo.easeInOut(q / 0.5) : 0); rig.userData.setVolts(false)
      }
      else { rig.userData.setLidLift(0); rig.userData.setVolts(p < 0.97) }                             // the run
      evolve(demo.clamp((p - LID) / (1 - LID), 0, 1))       // bands only while it runs
    }
  } else if (action === 'electrophorese' && container === 'gel') {
    // DOCK THE SAMPLE GEL IN THE TANK, run it, lift it out. The lid (leads and all) comes
    // straight up; the gel lifts straight up off the bench, glides over clear of the rim,
    // lowers onto the tank's PLATFORM socket under the buffer; the lid goes back on and the
    // run shows. At the end the gel rises STRAIGHT UP out of the tank.
    const rig = subject(demo.buildGelRig())
    st.dev = rig
    rig.userData.showGel(false)
    const tank = rig.userData.tank
    const SOCK = rig.userData.sampleSocket
    const ok = fitsSocket(tank, SOCK)
    if (ok) rig.userData.setCutaway?.(true)    // CUTAWAY: the gel is seen on its platform
    const BENCH = { x: demo.benchSlot(st, VD.width / 2, -1), z: 0 }
    const DOCK = socketY(tank, SOCK)
    const CLEAR = rig.userData.rimY + LIFT                  // gel base clears the rim on the way in/out
    const put = (x, y, z, inHand) => { const v = S[vessel]; S.at(v, st.x + x, y, z); v.userData.held = !!inHand; if (inHand) clearPlacement(v) }
    const onBench = () => { put(BENCH.x, 0, BENCH.z, false); placeOnBench(S[vessel]) }
    const docked = () => { const v = S[vessel]; put(DOCK.x, DOCK.y, DOCK.z, false); placeInto(v, tank, SOCK) }
    st.enter = () => { seat(BENCH.x); rig.userData.setLidLift(0); rig.userData.setVolts(false) }
    st.timeline = (p) => {
      const seg = (a, b) => demo.easeInOut(demo.clamp((p - a) / (b - a), 0, 1))
      if (!ok) { onBench(); rig.userData.setLidLift(0); rig.userData.setVolts(p > 0.4 && p < 0.82); evolve(p); return }
      if (p < 0.08) { rig.userData.setLidLift(seg(0, 0.08)); rig.userData.setVolts(false); onBench() }            // 1 · lid (with leads) lifts
      else if (p < 0.16) { rig.userData.setLidLift(1); put(BENCH.x, demo.lerp(0, CLEAR, seg(0.08, 0.16)), BENCH.z, true) } // 2 · gel straight up
      else if (p < 0.26) { rig.userData.setLidLift(1); const q = seg(0.16, 0.26); put(demo.lerp(BENCH.x, DOCK.x, q), CLEAR, demo.lerp(BENCH.z, DOCK.z, q), true) } // 3 · over the tank
      else if (p < 0.34) { rig.userData.setLidLift(1); put(DOCK.x, demo.lerp(CLEAR, DOCK.y, seg(0.26, 0.34)), DOCK.z, true) }  // 4 · onto the platform
      else if (p < 0.40) { docked(); rig.userData.setVolts(false); rig.userData.setLidLift(1 - seg(0.34, 0.40)) }  // 5 · lid back on
      else if (p < 0.82) { docked(); rig.userData.setLidLift(0); rig.userData.setVolts(true) } // 6 · the run
      else if (p < 0.88) { docked(); rig.userData.setVolts(false); rig.userData.setLidLift(seg(0.82, 0.88)) } // 7 · lid off
      else { const lift = exitLiftPoint(DOCK, CLEAR); put(lift.x, demo.lerp(DOCK.y, lift.y, seg(0.88, 1)), lift.z, true); rig.userData.setLidLift(1) } // 8 · straight up out
      evolve(demo.clamp((p - 0.40) / 0.42, 0, 1))      // contents change only while running
    }
  } else if (action === 'electrophorese') {
    // electrophorese on anything but a gel (a membrane: the blot) is not a gel-tank run
    // (#5). No transfer apparatus is modelled, so the vessel rests on the bench.
    st.enter = () => seat(0)
    st.timeline = (p) => { evolve(p) }
  } else if (action === 'store' && equipment === 'freezer') {
    // end-state storage: the vessel is picked up off the bench, carried to IN FRONT of the
    // open cavity at its floor height, slid straight in through the opening, set down on the
    // cavity floor (socket); the door closes; frost breathes.
    const fr = subject(demo.buildFreezer())
    st.dev = fr
    const FD = dims('ult_freezer_portable')
    st.cold = new PointLight(0x8fbaf0, 0, FD.width)
    const cav = fr.userData.cavity
    st.cold.position.set(0, (cav.bottom + cav.top) / 2, cav.front)
    st.group.add(st.cold)
    const SOCK = fr.userData.sampleSocket
    const ok = fitsSocket(fr, SOCK)
    if (ok) fr.userData.setCutaway?.(true)     // CUTAWAY: the vial is seen on its shelf behind the door
    const benchX = demo.benchSlot(st, VD.width / 2, -1)
    const shelf = socketY(fr, SOCK)
    const carryY = shelf.y + LIFT                           // just clear of the cavity floor
    const bench = { x: benchX, y: 0, z: 0 }
    const front = { x: shelf.x, y: carryY, z: cav.front + VD.depth / 2 + GAP }
    const inside = { x: shelf.x, y: carryY, z: shelf.z }
    const move = (v, a, b, q) => S.at(v, st.x + demo.lerp(a.x, b.x, q), demo.lerp(a.y, b.y, q), demo.lerp(a.z, b.z, q))
    st.enter = () => { seat(benchX); fr.userData.setDoor(true); fr.userData.setFrost(0); st.cold.intensity = 0 }
    st.timeline = (p) => {
      evolve(p)
      const v = S[vessel]
      if (!ok) { fr.userData.setDoor(false); return }
      fr.userData.setDoor(p < 0.7)
      v.userData.held = p >= 0.14 && p < 0.62
      if (v.userData.held) clearPlacement(v)
      if (p < 0.14) { S.at(v, st.x + bench.x, 0, bench.z); placeOnBench(v) }      // 1 · door opens; vial waits on the bench
      else if (p < 0.24) { move(v, bench, { x: bench.x, y: carryY, z: bench.z }, demo.easeInOut((p - 0.14) / 0.1)) }      // 2 · straight up
      else if (p < 0.42) { move(v, { x: bench.x, y: carryY, z: bench.z }, front, demo.easeInOut((p - 0.24) / 0.18)) }     // 3 · to the mouth
      else if (p < 0.56) { move(v, front, inside, demo.easeInOut((p - 0.42) / 0.14)) }                                    // 4 · straight in
      else if (p < 0.62) { move(v, inside, shelf, demo.easeInOut((p - 0.56) / 0.06)) }                                    // 5 · set down
      else {                                                                                                              // 6 · inside, door closed
        S.at(v, st.x + shelf.x, shelf.y, shelf.z); placeInto(v, fr, SOCK)
        st.cold.intensity = Math.max(0, (p - 0.7) * 5)
        fr.userData.setFrost(0.4 * Math.max(0, Math.sin((p - 0.7) * 7)))
      }
    }
  } else if (action === 'seed') {
    // dispense into the culture vessel; on agar, a spreader then sweeps it out. What is seeded
    // is the step's reagent — or, when it names NONE ("plate the transformation"), the SAMPLE
    // itself, drawn from the vessel it came in: a pipette transfer, no invented bottle.
    const prevC3 = prevContainer ? containerContract(prevContainer) : null
    if (!(o.reagents || []).length && prevC3 && prevC3.vessel !== vessel) {
      configurePipetteTransfer(st, S, {
        fromKey: prevC3.vessel, toKey: vessel,
        srcDisp: S[prevC3.vessel].userData.mouth, srcEntry: S[prevC3.vessel].userData.entry, dstDisp: MOUTH, dstEntry: ENTRY,
        srcToken: prevContainer, dstToken: container,
        color: endColor, startLevel, endLevel, name, vol,
      })
      st._skipHandoff = true
    } else {
      demo.stationReagent(st, SEAT_Y, { key: 'r', blabel: '', color: endColor, vessel, vlabel: name || '', vsub: vol || '', cStart: startColor, cEnd: endColor, lStart: startLevel, lEnd: endLevel, dispense: MOUTH, entry: ENTRY, rname: (o.reagents && o.reagents[0] && o.reagents[0].name) || '' })
    }
    if (container === 'agar_plate') {
      const spr = demo.buildSpreader()
      spr.visible = false
      spr.userData.offBench = true
      st.group.add(spr)
      const base = st.timeline
      // the FOOT stays on the agar: its centre circles inside the plate at a radius that keeps
      // its whole length inside the rim (the bend used to orbit at 0.45 R with the 38 mm foot
      // pointing outward — its tip swept past the rim, through the wall, over the bench)
      const F = spr.userData.fit, footC = F.toWorld(0.4, 0, 0), footTip = F.toWorld(0.8, 0, 0)
      const halfFoot = footTip.x - footC.x
      const R = Math.max(0, VD.radius - VD.wall - halfFoot - clearance('lift') * 0.12)
      const _fc = new Vector3()
      // dispense first (the whole pipette run in p 0-0.6), THEN spread (0.62-1) with the
      // spreader's foot ON the agar surface
      st.timeline = (p) => {
        base(demo.clamp(p / 0.6, 0, 1))
        spr.visible = p > 0.62
        const a = demo.clamp((p - 0.62) / 0.36, 0, 1) * Math.PI * 3 // sweeping circles
        spr.rotation.y = a
        _fc.set(footC.x, 0, footC.z).applyAxisAngle(_Y, a)            // the foot's centre, turned with it
        // ON THE PLATE, wherever it stands (a pipette-transfer seed puts it right of centre —
        // the spreader used to circle the station origin, spreading the bare bench)
        const pl = S[vessel].userData.tPos || S[vessel].position
        spr.position.set(pl.x - st.x + Math.cos(a) * R - _fc.x, pl.y + ENTRY, pl.z + Math.sin(a) * R - _fc.z)
      }
    }
  } else if (action === 'stain') {
    // flood a stain over the sample surface — the slide rests ACROSS the staining tray's
    // rails (socket), its length bridging them.
    const tray = subject(demo.buildStainingTray())
    const SOCK = tray.userData.sampleSocket
    const ok = fitsSocket(tray, SOCK)
    const benchX = ok ? 0 : demo.benchSlot(st, VD.width / 2, +1)
    st.enter = () => { seat(benchX); if (ok) seatIn(tray, SOCK) }
    st.timeline = (p) => {
      const f = demo.easeInOut(demo.clamp((p - 0.15) / 0.6, 0, 1))
      S[vessel].userData.setLevel(demo.lerp(startLevel, Math.max(startLevel, endLevel, 0.7), f))
      if (p > 0.2) S[vessel].userData.setColor(endColor) // dye floods over
    }
  } else if (action === 'measure') {
    // EQUIPMENT CONTRACT: read each vessel on the instrument it actually goes in; the vessel
    // sits in that instrument's socket while it reads.
    const inst = equipment
    const onStage = (dev, k = 1.3) => {
      st.dev = dev; subject(dev)
      const SOCK = dev.userData.sampleSocket
      const ok = fitsSocket(dev, SOCK)
      const benchX = ok ? 0 : demo.benchSlot(st, VD.width / 2, +1)
      st.enter = () => { seat(benchX); if (ok) seatIn(dev, SOCK); dev.userData.setProgress?.(0) }
      st.timeline = (p) => { evolve(p); dev.userData.setProgress?.(demo.easeInOut(demo.clamp(p * k, 0, 1))) }
    }
    if (inst === 'plate_reader') {
      // the plate RIDES the reader's carrier socket: it goes in and out with the drawer
      const reader = subject(demo.buildPlateReader())
      st.dev = reader
      const SOCK = reader.userData.sampleSocket
      const ok = fitsSocket(reader, SOCK)
      if (ok) reader.userData.setCutaway?.(true) // CUTAWAY: the plate is seen in the tunnel
      const benchX = ok ? 0 : demo.benchSlot(st, VD.width / 2, +1)
      st.enter = () => {
        demo.undockSample(); seat(benchX)
        if (ok) { placeInto(S[vessel], reader, SOCK, { ride: true }); S[vessel].userData.docked = true; S[vessel].userData.exitY = dims('plate_reader').height + VD.height + LIFT }
        reader.userData.setDrawer(true); reader.userData.setOD(0)
      }
      st.timeline = (p) => {
        const e = demo.easeInOut(demo.clamp(p * 1.3, 0, 1))
        reader.userData.setDrawer(p < 0.35)                     // plate slides in on the carrier, then reads
        reader.userData.setOD(e * 1.85)
        evolve(p)
      }
    } else if (inst === 'nanodrop') {
      // a NanoDrop reads a 1–2 µL drop on its pedestal — the TUBE stays on the bench beside it
      const nano = demo.buildNanoDrop()
      st.dev = nano; st.group.add(nano); st.updatables.push(nano)
      const NW = dims('nanodrop').width
      nano.position.set(NW / 2 + GAP + VD.width / 2, 0, 0); placeOnBench(nano)
      // FROM THE ICE: a sample kept on ice through the step before is TAKEN FROM it — it
      // starts in its ice bucket beside the bench spot, lifts straight up clear of the rim,
      // and is set down beside the NanoDrop before the reading (it used to start on the bench)
      const bucket = o.prevOnIce ? demo.buildIceBucket() : null
      if (bucket && canPlace(V, bucket, bucket.userData.sampleSocket)) {
        const BW = dims('ice_bucket_4l').diameter
        st.group.add(bucket); placeOnBench(bucket); st.updatables.push(bucket)
        bucket.position.x = demo.benchSlot(st, BW / 2, -1); st.group.updateMatrixWorld(true)
        bucket.userData.setCutaway?.(true)                 // CUTAWAY: the tube is seen in the ice
        const BS = bucket.userData.sampleSocket, seatP = socketY(bucket, BS), carryY = dims('ice_bucket_4l').height + LIFT
        const at = (x, y, z) => S.at(S[vessel], st.x + x, y, z)
        st.enter = () => { seat(0); seatIn(bucket, BS); nano.userData.setProgress?.(0) }
        st.timeline = (p) => {
          const v = S[vessel], seg = (a, b) => demo.easeInOut(demo.clamp((p - a) / (b - a), 0, 1))
          v.userData.held = p >= 0.04 && p < 0.26
          if (p < 0.04) seatIn(bucket, BS)                                                              // 1 · on ice
          else if (p < 0.12) { clearPlacement(v); at(seatP.x, demo.lerp(seatP.y, carryY, seg(0.04, 0.12)), seatP.z) }  // 2 · straight up out of the ice
          else if (p < 0.2) { clearPlacement(v); const q = seg(0.12, 0.2); at(demo.lerp(seatP.x, 0, q), carryY, demo.lerp(seatP.z, 0, q)) } // 3 · across to the NanoDrop
          else if (p < 0.26) { clearPlacement(v); at(0, demo.lerp(carryY, 0, seg(0.2, 0.26)), 0) }     // 4 · down beside it
          else seat(0)                                                                                  // 5 · on the bench; the drop is read
          nano.userData.setProgress?.(demo.easeInOut(demo.clamp((p - 0.26) / 0.6, 0, 1)))
          evolve(p)
        }
      } else {
        st.enter = () => seat(0)
        st.timeline = (p) => { evolve(p); nano.userData.setProgress?.(demo.easeInOut(demo.clamp(p * 1.4, 0, 1))) }
      }
    } else if (inst === 'inverted_microscope') {
      onStage(demo.buildInvertedMicroscope())
    } else if (inst === 'light_microscope') {
      onStage(demo.buildLightMicroscope())
    } else if (inst === 'uv_transilluminator') {
      onStage(demo.buildUVTransilluminator())
    } else {
      // no instrument accepts this vessel: hold it AT REST with its readout.
      st.enter = () => seat(0)
      st.timeline = (p) => { evolve(p) }
    }
  } else {
    // generic actionable (rare): hold the vessel AT REST — stillness is honest.
    st.enter = () => seat(0)
    st.timeline = (p) => { evolve(p) }
  }

  // Bug #2: if the sample's CONTAINER changed from the previous station, ANIMATE the
  // hand-off (old vessel lifts out → new vessel settles in). Skip actions that already
  // choreograph the vessel (transfer, centrifuge, freezer store).
  // THE SUBJECT: the vessel or object this step acts on (the visibility checks and the
  // camera frame it). Branches that act on something else set it above.
  if (!st.subject) st.subject = () => S[vessel]
  const prevVessel = prevContainer ? containerContract(prevContainer).vessel : null
  const custom = (action === 'store' && equipment === 'freezer') || equipment === 'centrifuge'
  if (prevVessel && prevVessel !== vessel && !custom && !st._skipHandoff) {
    wrapHandoff(st, S, prevVessel, vessel, startColor, startLevel)
  }
  hideLabels(st.group)
}

// A NEST move (Stage-18): "transfer the column to a clean tube". You pick up the spin
// COLUMN (its used collection tube stays on the bench) and drop it INTO a fresh 1.5 mL tube
// — at REAL size the column's cup fits the tube and its FLANGE rests on the tube's rim (the
// old move shrank the column 16 % to make it fit). No liquid moves, no pipette.
function configureNestMove(st, S, o) {
  const { columnKey, tubeKey, color, level } = o
  const col0 = S[columnKey], tube0 = S[tubeKey]
  const CD = dims(col0.userData.spec), TD = dims(tube0.userData.spec)
  const GAP = clearance('bench_gap'), LIFT = clearance('lift')
  const AX = -(GAP / 2 + CD.width / 2), BX = GAP / 2 + TD.width / 2, Z = 0
  st.benchReserved = [{ minX: AX - CD.width / 2, maxX: AX + CD.width / 2 }, { minX: BX - TD.width / 2, maxX: BX + TD.width / 2 }]
  const CARRY = TD.height + LIFT                                    // the column's base clears the tube top
  const NEST_Y = tube0.userData.mouth.y - col0.userData.flangeY      // flange seated on the tube rim
  st.subject = () => S[columnKey]                                      // the COLUMN is what moves
  st.cosubjects = () => [S[tubeKey]]                                   // …into the clean tube: both are what the step is about
  // the clean tube takes the column as an INSERT: a socket whose point is where the column's
  // base centre sits when its flange rests on the rim — contact is judged there
  if (!tube0.userData.sockets?.insert) addSocket(tube0, 'insert', { position: new Vector3(0, NEST_Y, 0), accepts: ['spin_column_mini'] })
  st.enter = () => {
    S.only(tubeKey)
    S[columnKey].userData.reattachCollection?.()   // arrives as the full assembly
    const col = S[columnKey], tube = S[tubeKey]
    col.visible = true; tube.visible = true
    col.rotation.set(0, 0, 0); tube.rotation.set(0, 0, 0)
    col.scale.setScalar(1)
    col.userData.setColor?.(color); col.userData.setLevel?.(level)
    tube.userData.setLevel?.(0)
    S.snapTo(col, st.x + AX, 0, Z); placeOnBench(col); col.userData.held = false
    S.snapTo(tube, st.x + BX, 0, Z); placeOnBench(tube)
    st.collSeat = col.userData.placement            // the assembly's seat — the collection tube keeps it
  }
  st.timeline = (p) => {
    const col = S[columnKey], tube = S[tubeKey]
    col.visible = true; tube.visible = true
    tube.userData.setLevel?.(0)              // the clean tube NEVER fills — no liquid moves
    S.snapTo(tube, st.x + BX, 0, Z)
    if (p > 0.001) { col.userData.detachCollection?.(st.group); const cg = col.userData.collection; if (cg && st.collSeat) cg.userData.placement = st.collSeat }
    else col.userData.reattachCollection?.()
    let x, y
    if (p < 0.34) { x = AX; y = demo.lerp(0, CARRY, demo.easeInOut(p / 0.34)) }                 // 1 · straight up
    else if (p < 0.66) { x = demo.lerp(AX, BX, demo.easeInOut((p - 0.34) / 0.32)); y = CARRY }   // 2 · across, high
    else { x = BX; y = demo.lerp(CARRY, NEST_Y, demo.easeInOut((p - 0.66) / 0.34)) }             // 3 · down into the tube
    col.scale.setScalar(1)
    col.userData.setLevel?.(level)
    col.userData.held = p > 0.001 && p < 0.999
    S.snapTo(col, st.x + x, y, Z)
    if (p >= 0.999) placeInto(col, tube, 'insert'); else if (p > 0.001) clearPlacement(col); else placeOnBench(col)
  }
}

// Wrap a station's enter/timeline with a visible container hand-off: for the first TR of
// the step the OLD vessel lifts straight up and out, then the NEW vessel descends into its
// seat. The lift clears both vessels' heights (+ the lift clearance) — no typed height.
function wrapHandoff(st, S, fromKey, toKey, color, level) {
  const baseEnter = st.enter
  const baseTimeline = st.timeline
  const TR = 0.26
  const LIFT = Math.max(dims(S[fromKey].userData.spec).height, dims(S[toKey].userData.spec).height) + clearance('lift')
  // while the old vessel is lifted out, IT is what the step shows; then the new one
  st.subject = () => (S[toKey].visible ? S[toKey] : S[fromKey])
  // the OLD vessel stands on the BENCH in FRONT of the station (clear of everything on it) —
  // never on the new vessel's seat, which may be a socket that does not take it (a tube on
  // a microscope stage), and not at the far end of the bench, where the camera had to go
  const OD = dims(S[fromKey].userData.spec)
  st.group.updateMatrixWorld(true)
  let front = S[toKey].userData.tPos ? 0 : 0
  for (const c of st.group.children) { if (c.isLight || c.isSprite || c === st.pip || c.userData.offBench) continue; const b = solidBox(c, st.group); if (!b.isEmpty()) front = Math.max(front, b.max.z) }
  front = Math.max(front, dims(S[toKey].userData.spec).depth / 2)
  const oldX = 0, oldZ = front + clearance('bench_gap') + OD.depth / 2
  st.enter = () => {
    baseEnter && baseEnter()             // seats the NEW vessel at its target + sets its state
    const nv = S[toKey]
    st._seat = nv.userData.tPos.clone()
    const ov = S[fromKey]
    ov.visible = true
    ov.rotation.set(0, 0, 0)
    ov.userData.setColor?.(color)
    ov.userData.setLevel?.(level)
    ov.userData.held = false
    S.snapTo(ov, st.x + oldX, 0, oldZ); placeOnBench(ov)
    nv.visible = false
    st._handoff = true
  }
  st.timeline = (p) => {
    if (p < TR) {
      const q = p / TR
      const ov = S[fromKey]
      const nv = S[toKey]
      if (q < 0.5) {                     // old vessel lifts straight up (remove)
        ov.visible = true; nv.visible = false
        const e = demo.easeInOut(q / 0.5)
        S.snapTo(ov, st.x + oldX, e * LIFT, oldZ)
        ov.userData.held = e > 0
      } else {                           // new vessel settles down into the seat (insert)
        ov.visible = false; nv.visible = true
        const e = demo.easeInOut((q - 0.5) / 0.5)
        nv.userData.setColor?.(color)
        nv.userData.setLevel?.(level)
        S.snapTo(nv, st._seat.x, st._seat.y + (1 - e) * LIFT, st._seat.z)
        nv.userData.held = e < 1
      }
    } else {
      if (st._handoff) {
        S.only(toKey)
        S.snapTo(S[toKey], st._seat.x, st._seat.y, st._seat.z)
        S[toKey].userData.held = false
        S[fromKey].rotation.set(0, 0, 0)
        st._handoff = false
      }
      baseTimeline && baseTimeline((p - TR) / (1 - TR))
    }
  }
}

// A CONTENTS MOVE (Stage-13): the sample's LIQUID moves A→B with a PIPETTE — aspirate from
// the source (the tip at the SOURCE's own entry depth), cruise, dispense into the
// destination's mouth (straight, or in along a flask's canted neck). Both vessels stand on
// the bench side by side, spaced by their REAL footprints.
function configurePipetteTransfer(st, S, o) {
  const { fromKey, toKey, srcDisp, srcEntry, dstDisp, dstEntry, color, startLevel, endLevel, name, vol } = o
  const { AX, BX, srcFoot, dstFoot } = sideBySide(o.srcToken, o.dstToken)
  const Z = 0
  const hA = dims(S[fromKey].userData.spec).height, hB = dims(S[toKey].userData.spec).height
  st.benchReserved = [{ minX: AX + srcFoot.minX, maxX: AX + srcFoot.maxX }, { minX: BX + dstFoot.minX, maxX: BX + dstFoot.maxX }]
  const dstAngled = dstDisp && dstDisp.approach === 'angled'
  const from = { x: AX + (srcDisp?.x || 0), y: srcEntry, z: Z + (srcDisp?.z || 0) }
  const to = { x: BX + (dstDisp?.x || 0), y: dstAngled ? dstDisp.y : 0, z: Z + (dstDisp?.z || 0) }
  demo.addPipetteRig(st)
  // the step acts on the SOURCE while the tip draws from it, then on the destination
  st.subject = () => S[toKey]
  st.subjectAt = (p) => (p < 0.3 ? S[fromKey] : S[toKey])

  st.enter = () => {
    S.only(toKey)
    const a = S[fromKey], b = S[toKey]
    a.visible = true; b.visible = true
    a.rotation.set(0, 0, 0); b.rotation.set(0, 0, 0)
    a.userData.held = false; b.userData.held = false
    if (name) a.userData.setLabel?.(name, vol || '')
    a.userData.setColor?.(color); a.userData.setLevel?.(startLevel)
    b.userData.setColor?.(color); b.userData.setLevel?.(0.03)
    S.snapTo(a, st.x + AX, 0, Z); placeOnBench(a)
    S.snapTo(b, st.x + BX, 0, Z); placeOnBench(b)
    demo.pipRest(st)
  }

  st.timeline = (p) => {
    const a = S[fromKey], b = S[toKey]
    a.visible = true; b.visible = true
    S.snapTo(a, st.x + AX, 0, Z)
    S.snapTo(b, st.x + BX, 0, Z)
    // a capped vessel (cryovial, flask) opens before the tip reaches it and closes after
    S[fromKey].userData.setCap?.(!(p > 0.01 && p < 0.32))
    S[toKey].userData.setCap?.(!(p > 0.4 && p < 0.97))
    demo.pipetteRun(st, from, to, p, { color, fill: 0.8, approach: dstDisp?.approach, tilt: dstDisp?.tilt, depth: dstDisp?.depth, standoff: dstDisp?.standoff, dipDepth: dstEntry })
    a.userData.setLevel?.(demo.lerp(startLevel, 0.03, demo.easeInOut(demo.clamp((p - 0.13) / 0.13, 0, 1))))
    if (p > 0.68) {
      const q = demo.dispenseProgress(p)
      b.userData.setColor?.(color)
      b.userData.setLevel?.(demo.lerp(0.03, endLevel, q))
    }
    if (p > 0.98) { a.visible = false; S.only(toKey); S.snapTo(b, st.x + BX, 0, Z) }
  }
}

// The sample's carried contents at EVERY step (pure fold; step N start == step N-1 end),
// honouring the chosen alternative so a jump still resolves right. Exported so the
// geometry audit builds the line exactly as the runner does.
export function lineStateChain(steps, lang, altByStep = {}) {
  let color = INIT_COLOR
  let level = INIT_LEVEL
  return steps.map((s) => {
    const eff = hasAlternatives(s) ? selectAlternative(s, altByStep[s.index] || 0) : s
    const prim = (eff.reagents || []).find((r) => r.volume) || (eff.reagents || [])[0]
    const c = new Color(reagentColor(prim ? reagentName(prim, lang) : null)).getHex()
    const f = resolveRecipe(eff.action).anim.fill
    // A SIDE PREPARATION happens in its OWN vessel (built from its reagents in
    // configureStation) — the travelling sample is untouched. Carry its state forward
    // unchanged; `start`/`end` describe the IDLE sample, not the mix.
    if (eff.action === 'prepare') {
      const held = { color, level }
      return { start: held, end: held } // don't advance the sample's colour/level
    }
    const start = { color, level }
    const end = stepEnd(eff.action, start, c, f)
    color = end.color
    level = end.level
    return { start, end }
  })
}

// The configureStation options for step i — the ONE mapping from a parsed step to a
// station, shared by the runner's line build and the geometry audit (so they cannot drift).
export function stationConfig(steps0, i, { containers, stateChain, lang = 'en', altByStep = {}, producedInRun }) {
  // what each station DEPICTS (sceneStep: a frozen store the sample is used after is shown
  // as on ice now) — the step as parsed stays the runner's text
  const steps = steps0.map((_, j) => sceneStep(steps0, j))
  const baseStep = steps[i]
  const altIdx = altByStep[baseStep.index] || 0
  const container = containers[i] || 'microtube'
  const prevContainer = i > 0 ? (containers[i - 1] || 'microtube') : null
  const o = stationParams(baseStep, lang, altIdx, stateChain[i], producedInRun, container)
  // the neighbours' instruments (a thermocycler's lid stays down between its program steps)
  const eqAt = (j) => (j >= 0 && j < steps.length) ? resolveRecipe(effectiveStep(steps[j], altByStep[steps[j].index] || 0).action, { container: containers[j] || 'microtube', conditions: stepConditions(steps[j]), spin: steps[j].spin }).equipment : null
  return {
    o, altIdx, container,
    opts: {
      action: o.action, equipment: o.equipment, container, prevContainer, color: o.colorHex, name: o.title, vol: o.vol, seconds: o.seconds,
      startColor: o.start.color, startLevel: o.start.level, endColor: o.end.color, endLevel: o.end.level, cycles: o.cycles, reagents: o.reagents,
      drawsFrom: o.drawsFrom, produces: o.produces, text: o.text, tempC: o.tempC, onIce: o.onIce, rcf: o.rcf,
      prevEquipment: eqAt(i - 1), nextEquipment: eqAt(i + 1),
      prevOnIce: i > 0 && !!stepConditions(steps[i - 1]).onIce && (containers[i - 1] || null) === container,
    },
  }
}
export function producedInRunOf(steps) {
  return new Set(steps.filter((s) => s.action === 'prepare' && s.produces).map((s) => s.produces))
}

function useContainers(steps) {
  return useMemo(() => sampleContainerSequence(steps), [steps])
}

// Per-step build + display params for one station in the line.
export function stationParams(baseStep, lang, altIdx, chain, producedInRun, container) {
  const step = effectiveStep(baseStep, altIdx) // follow the chosen either/or method
  // the instrument comes from the action + the sample's container + what the step states
  const { equipment } = resolveRecipe(step.action, { container, conditions: stepConditions(step), spin: step.spin })
  // EVERY reagent (name · volume · colour), so a multi-reagent step renders all of them,
  // not just the first. Deduped by name so a conditional volume (the SAME reagent listed
  // as 350 µl / 600 µl variants) stays one bottle, not two.
  const seenReag = new Set()
  const reagents = (step.reagents || [])
    .map((r) => { const nm = reagentName(r, lang); return { name: nm, vol: reagentVolume(r, lang) || '', color: new Color(reagentColor(nm)).getHex() } })
    .filter((r) => r.name && !seenReag.has(r.name) && seenReag.add(r.name))
  const primary = (step.reagents || []).find((r) => r.volume) || (step.reagents || [])[0]
  const primaryName = primary ? reagentName(primary, lang) : null
  const colorHex = new Color(reagentColor(primaryName)).getHex()
  const vol = (primary && reagentVolume(primary, lang)) || ''
  const title = primaryName || ACTION_LABEL[step.action] || 'Step'
  const sub = vol || (step.spin?.rcf_min ? `≥ ${step.spin.rcf_min.toLocaleString()} ×g` : '')
  const fill = resolveRecipe(step.action).anim.fill
  const start = chain?.start || { color: INIT_COLOR, level: INIT_LEVEL }
  const end = chain?.end || { color: colorHex, level: fill }
  const cycles = step.repeat && typeof step.repeat.count === 'number' ? step.repeat.count : 0
  // draws_from only renders as an on-bench mix tube when its product is actually made in
  // this run; a do-ahead buffer (in the intake checklist) stays a normal bottle.
  const drawsFrom = (step.draws_from && producedInRun && producedInRun.has(step.draws_from)) ? step.draws_from : null
  const cond = stepConditions(step)
  return { action: step.action, equipment, colorHex, vol, title, sub, seconds: step.duration_seconds, start, end, cycles, reagents,
           tempC: cond.tempC, onIce: !!cond.onIce, rcf: step.spin?.rcf_min ?? null,
           target: step.target || 'sample', produces: step.produces || null, drawsFrom,
           text: step.text_en || step.text || '' }
}

// DEV ONLY — `?pin=<0..1>` holds the active station's timeline at that progress (the
// review renders: a station at its start, middle and end, in the real runner)
const PIN = (import.meta.env?.DEV && typeof window !== 'undefined')
  ? parseFloat(new URLSearchParams(window.location.search).get('pin')) : NaN

export default function StationScene({ protocol, activeIndex = 0, lang = 'en', altByStep = {}, timerRef: timerProp, chromeless = false }) {
  ensureMaps()
  // the one scene preset (surfaces + backdrop + fog + lights as one coherent set)
  const preset = useMemo(() => resolveScenePreset(), [])
  const presetRef = useRef(preset); presetRef.current = preset
  // The countdown lives in a STABLE ref owned by the runner (mutated in place at 10 Hz),
  // so the frame loop reads the live clock WITHOUT this component ever re-rendering on a
  // tick. Fall back to a local idle ref when none is supplied (the dev matrix harness).
  const localTimer = useRef({ progress: 1, running: false, hasTimer: false, done: false })
  const timerRef = timerProp || localTimer
  const { gl, scene, camera } = useThree()
  const steps = protocol?.steps || []
  const containers = useContainers(steps)
  const active = Math.max(0, Math.min(activeIndex, steps.length - 1))
  const totalLen = Math.max(0, steps.length - 1) * SPACING

  // The sample's carried contents at EVERY step (pure fold; step N start == step
  // N-1 end), honouring the chosen alternative so a jump still resolves right.
  const stateChain = useMemo(() => lineStateChain(steps, lang, altByStep), [steps, lang, altByStep])

  // Camera-rail + line state — refs so the frame loop reads them without a re-render.
  const stationsRef = useRef(null)
  const railXRef = useRef(0)
  const targetXRef = useRef(0)
  const glideRef = useRef({ active: false, t: 0, from: 0, to: 0 })
  const activeRef = useRef(0)
  const prevActiveRef = useRef(-1)
  const pRef = useRef(0)
  const restartRef = useRef(true)
  const perspRef = useRef()
  const keyRef = useRef()
  const rimRef = useRef()
  const camFrameRef = useRef({ init: false })
  // prep-vessel lifetimes: id -> { prepareIndex, consumerIndex, home:{x,y,z}, draw:{x,y,z} }.
  // Drives where each carried mixture sits (home vs the station drawing from it) and when
  // it is visible (from where it's made through where it's consumed).
  const prepMetaRef = useRef({})
  // constant point-light pool — see the env effect
  const lightPoolRef = useRef([])

  // Position + show/hide every prep vessel for the active station: at its consumer it sits
  // at the draw seat (so it's carried there), otherwise at its home; visible only across
  // its lifetime. Snap policy is whatever the caller set (jump snaps, sequential glides),
  // so a prep travels on the SAME rails as the sample.
  const placePreps = (active) => {
    const meta = prepMetaRef.current
    for (const id in meta) {
      const m = meta[id]
      const end = m.consumerIndex == null ? m.prepareIndex : m.consumerIndex
      demo.setPrepVisible(id, active >= m.prepareIndex && active <= end)
      const atConsumer = m.consumerIndex != null && active === m.consumerIndex && m.consumerIndex !== m.prepareIndex
      const t = atConsumer ? m.draw : m.home
      demo.prepAt(id, t.x, t.y, t.z)
    }
  }

  // one-time scene setup + the persistent travelling SAMPLE (preset-independent, so a
  // live bench flip never recreates the sample).
  useEffect(() => {
    demo.setRenderer(gl)
    demo.setScene(scene)
    ensureMaps()
    scene.environment = demo.buildEnvMap()
    // the background texture renders ~15 RGB darker in modern three than r128;
    // lift it so the wall matches the demo's greige (measured, not eyeballed).
    scene.environmentIntensity = 2.5
    scene.backgroundIntensity = 1.19
    const S = demo.initSample()
    S.vessels.forEach((v) => v.userData.label && (v.userData.label.visible = false))
    // A CONSTANT POINT-LIGHT POOL. three keys every shader program on the number of VISIBLE
    // point lights, and station lights (heat-bath glow, ice/freezer cold, microscope lamp,
    // UV box) live in station groups whose visibility follows the fade — so entering such a
    // station changed the count and recompiled every lit material on screen (frame-probe:
    // up to 1.6 s). Station lights are therefore never rendered themselves (hidden at
    // build); each frame the nearest visible stations' lights are mirrored into these
    // always-visible slots (unused slots at intensity 0), so the count never changes and
    // the precompile below covers every frame.
    const pool = []
    for (let i = 0; i < LIGHT_POOL; i++) { const L = new PointLight(0xffffff, 0, 1); pool.push(L); scene.add(L) }
    lightPoolRef.current = pool
    return () => {
      for (const L of pool) { scene.remove(L); L.dispose() }
      lightPoolRef.current = []
      S.vessels.forEach((v) => {
        scene.remove(v)
        disposeGroup(v)
      })
      scene.environment = null
    }
  }, [gl, scene])

  // backdrop + fog come from the active PRESET — reset them when the bench flips.
  useEffect(() => {
    scene.background = demo.makeCineBackdrop(preset)
    const f = preset.lights.fog
    scene.fog = new FogExp2(f.color, f.density)
    return () => { scene.background = null; scene.fog = null }
  }, [scene, preset])

  // the key + rim light targets follow the framed station (re-added when the preset flips,
  // since the rim light only exists in the dark preset).
  useEffect(() => {
    if (keyRef.current) scene.add(keyRef.current.target)
    if (rimRef.current) scene.add(rimRef.current.target)
  }, [scene, preset])

  // ── BUILD THE WHOLE LINE ONCE — one station per step along +X at SPACING.
  // Rebuilds ONLY on a structural change (protocol / language / chosen method),
  // NEVER on step navigation. Stations persist for the session; a step change
  // only dollies the camera and glides the single sample. ──
  useEffect(() => {
    if (!demo.getSample()) return undefined
    demo.initPreps() // dispose any prior run's carried mixtures before rebuilding the line
    // A transfer whose destination container == the previous container never actually
    // moves the sample — the parse omitted the destination and it carried forward.
    // Warn loudly; a silent fallback is exactly how the "load column" defect hid.
    for (const d of findTransferHandoffDefects(steps)) {
      console.warn(`[benchpilot] transfer step ${d.index} does not name a destination container ` +
        `(stays "${d.container}") — the hand-off cannot fire. This is a parse defect: every transfer must set \`container\`.`)
    }
    // Which prep products are actually MADE on the bench in this run (a just-in-time
    // `prepare` station). A `draws_from` that points at one of these draws from the tube
    // you watched being made; a `draws_from` pointing at a DO-AHEAD buffer (lifted into
    // the intake checklist, never a station) is just a reagent from a bottle — so it must
    // NOT render as an on-bench mix tube.
    const producedInRun = producedInRunOf(steps)
    const stations = []
    steps.forEach((baseStep, i) => {
      const { o, altIdx, container, opts } = stationConfig(steps, i, { containers, stateChain, lang, altByStep, producedInRun })
      const st = { group: new Group(), updatables: [], reagents: {}, pip: null, enter: null, timeline: null, x: i * SPACING, cen: null, dev: null, vis: 0, _vstate: -1 }
      configureStation(st, opts)
      // MEASURE the framing from the equipment now — group is still at the origin and
      // carries only the instrument (not the label/decal added below), so this is the
      // station's true content extent in local coords.
      st.frame = frameStation(st)
      st.group.position.set(st.x, 0, 0)
      // the title sits just ABOVE the thing the step is about — the props' bbox top,
      // centred on it — not over the station origin. Its own half-height (worldH/2)
      // plus a small gap put the plate's BOTTOM edge clear of the subject.
      // chromeless (the Home hero): just the lit glass, no title plate, no bench number.
      // A `prepare` station's subject is the CARRIED prep tube, which owns its own label and
      // travels with it — a station title here would duplicate it (and be left behind), so skip.
      if (!chromeless) addStationLabel(st, o.title, o.sub)
      scene.add(st.group)
      // (no station-number decal on the bench: the step number is in the timeline above)
      // BENCH-FALLBACK STAGING: a step that rests on the bare bench (no modelled instrument)
      // shows only what it states — a bench tag for a stated temperature / room temperature,
      // (A timed wait has no bench dial: the countdown lives in the HUD.)
      const staging = BENCH_REST_ACTIONS.has(o.action)
        ? benchStaging(effectiveStep(baseStep, altIdx), o.equipment) : null
      if (staging && staging.tag && !chromeless) {
        const tag = makeBenchTag(staging.tag)
        tag.position.set(st.x + 0.9 + tag.userData.width / 2, 0.021, 2.4)   // just right of the number
        scene.add(tag)
        st.benchTag = tag
      }
      collectStationMats(st) // snapshot opacities so the unit fades as one
      stations.push(st)
    })
    stationsRef.current = stations

    // wire each carried mixture's lifetime: where it's MADE (prepare station) and where it's
    // DRAWN FROM (consumer station). Its home is the make seat; its draw seat is the consumer.
    const meta = {}
    for (let si = 0; si < stations.length; si++) {
      const st = stations[si]
      if (st.prepId) meta[st.prepId] = { ...(meta[st.prepId] || {}), prepareIndex: si, home: st.prepHome }
      if (st.drawsFromId) meta[st.drawsFromId] = { ...(meta[st.drawsFromId] || {}), consumerIndex: si, draw: st.drawPos }
    }
    // a prep with no home (consumer built but its prepare wasn't) can't travel — drop it.
    for (const id in meta) if (!meta[id].home) delete meta[id]
    prepMetaRef.current = meta

    // frame + seat the active station: snap the sample there, park the camera on it.
    const a = Math.max(0, Math.min(active, stations.length - 1))
    railXRef.current = stations[a] ? stations[a].x : 0
    targetXRef.current = railXRef.current
    glideRef.current = { active: false, t: 0, from: railXRef.current, to: railXRef.current }
    demo.undockSample() // in case a rebuild interrupted a spin
    demo.setSnap(true)
    stations[a]?.enter?.()
    placePreps(a) // snap each carried mixture to its home/draw seat for the initial frame
    demo.setSnap(false)
    pRef.current = 0
    restartRef.current = true
    activeRef.current = a
    prevActiveRef.current = a

    // station lights are mirrored into the constant pool (env effect); never render them.
    for (const st of stations) {
      st.vLights = []
      st.group.traverse((o) => { if (o.isPointLight) { o.visible = false; st.vLights.push(o) } })
    }

    // PRE-COMPILE every station's shaders NOW, while the 3D is loading, instead of on each
    // station's first appearance (frame-probe: 9 of 137 stations blocked 67-1617 ms on
    // entry compiling ~11 new programs). compile() walks the whole scene — hidden stations
    // included — and with KHR_parallel_shader_compile the link runs off the main thread;
    // compileAsync resolves when every program is ready. __benchperf.precompiled marks it.
    let cancelled = false
    if (typeof window !== 'undefined') (window.__benchperf || (window.__benchperf = {})).precompiled = false
    // Two passes: a station mid-fade has every material set transparent (applyStationVis),
    // which flips three's `opaque` bit in the program key — so the faded variant is
    // compiled too (pass 1), then the base look (pass 2). compile() itself is synchronous;
    // only the wait for the parallel link is async.
    const fading = []
    for (const st of stations) for (const e of st.mats || []) if (!e.m.transparent) { e.m.transparent = true; fading.push(e.m) }
    const faded = gl.compileAsync(scene, camera)
    for (const m of fading) m.transparent = false
    Promise.all([faded, gl.compileAsync(scene, camera)]).then(() => {
      if (!cancelled && typeof window !== 'undefined') window.__benchperf.precompiled = true
    }).catch(() => {})

    return () => {
      cancelled = true
      for (const st of stations) {
        scene.remove(st.group)
        disposeGroup(st.group)
        if (st.decal) { scene.remove(st.decal); disposeGroup(st.decal) }
        if (st.benchTag) { scene.remove(st.benchTag); disposeGroup(st.benchTag) }
      }
      demo.initPreps() // dispose the carried mixtures (scene-parented, outside the groups)
      prepMetaRef.current = {}
      stationsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, stateChain, containers])

  // ── STEP CHANGE: dolly the camera + glide the sample. NEVER rebuild a station. ──
  useEffect(() => {
    const stations = stationsRef.current
    if (!stations || !stations[active]) return
    if (prevActiveRef.current === active) return // already framed (e.g. just built)
    const sequential = prevActiveRef.current >= 0 && Math.abs(active - prevActiveRef.current) === 1
    // rail-dolly the camera to the active station (damped, no cut / pop-in)
    glideRef.current = { active: true, t: 0, from: railXRef.current, to: stations[active].x }
    targetXRef.current = stations[active].x
    // the single sample glides (sequential) or snaps (jump) to the new station. If we
    // left a spin mid-way, free the sample from the rotor — and on a sequential Next lift
    // it STRAIGHT UP out of the instrument before gliding (never a teleport through the lid).
    demo.undockSample(sequential)
    demo.getSample()?.vessels.forEach((v) => v.rotation.set(0, 0, 0))
    demo.setSnap(!sequential)
    stations[active].enter?.()
    placePreps(active) // carry each prep to its seat — glides on a sequential Next, snaps on a jump
    demo.setSnap(false)
    pRef.current = 0
    restartRef.current = true
    activeRef.current = active
    prevActiveRef.current = active
  }, [active])

  // ── FRAME LOOP — the demo's animate(): rail-dolly the camera, run the active
  // station's p-timeline, fade equipment by distance from the rail, and glide the
  // one sample along the line. ──
  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05)
    const time = state.clock.elapsedTime
    const stations = stationsRef.current
    if (!stations) return
    // THE FRAME CLOCK: a timed step's progress is read HERE, every frame, from the
    // countdown's live() (performance.now — pinned to a fixed step by the capture harness,
    // so seeded renders stay deterministic). It used to arrive only when the Runner
    // re-rendered on the 10 Hz countdown tick, so ~83% of frames repeated the last pose.
    // Everything below (the timeline, driveTimed, the dial) reads this one value.
    { const tmr = timerRef.current; if (tmr.live) tmr.progress = tmr.live() }

    // 1 · ease railX toward the active station's X
    const g = glideRef.current
    if (g.active) {
      g.t = Math.min(g.t + dt / GLIDE_DUR, 1)
      railXRef.current = demo.lerp(g.from, g.to, demo.easeInOut(g.t))
      if (g.t >= 1) { g.active = false; railXRef.current = g.to }
    }
    const railX = railXRef.current

    // 2 · position the cinematic camera — pure lateral tracking, no orbit — aimed and
    // fit on the active station's MEASURED content frame (never an assumed origin).
    const actCam = stations[activeRef.current]
    const tf = actCam && actCam.frames ? frameAt(actCam, pRef.current) : actCam && actCam.frame ? actCam.frame : DEFAULT_FRAME
    // ease the framing (look point + distance) toward the active station's, so a step change
    // from a 41 mm tube to a 450 mm incubator dollies and zooms, never pops
    const cf = camFrameRef.current
    if (tf.dist != null) {
      if (!cf.init) { cf.center = tf.center.clone(); cf.dist = tf.dist; cf.dir = (tf.dir || DIR0).clone(); cf.init = true }
      const k = 1 - Math.pow(0.002, dt)
      cf.center.lerp(tf.center, k); cf.dist += (tf.dist - cf.dist) * k
      cf.dir.lerp(tf.dir || DIR0, k).normalize()                       // a three-quarter view swings in, never pops
    }
    const f = tf.dist != null ? { center: cf.center, dist: cf.dist, dir: cf.dir } : tf
    const cam = perspRef.current
    if (cam) {
      // the pose is a pure function of the measured frame (stationCamera.js) — the SAME one
      // the headless visibility audit computes
      const push = actCam && actCam.pushCam ? actCam.pushCam(pRef.current) : 0
      const pose = cameraPose(f, { railX, time, push, pushTarget: actCam && actCam.pushTarget })
      cam.position.set(pose.pos[0], pose.pos[1], pose.pos[2])
      cam.lookAt(pose.look[0], pose.look[1], pose.look[2])
      // keep the active station's title label INSIDE the frame, below the top HUD band:
      // if its top edge would project above LABEL_TOP_NDC, lower it (never below the
      // subject's top) — a pushed-in or widened frame used to clip it at the top edge
      if (actCam && actCam.label) clampLabel(actCam, cam)
      // only the ACTIVE station's title shows: a neighbour's plate hung in the edge of a
      // three-quarter view, naming a machine that is not the step's
      for (const s2 of stations) if (s2.label) s2.label.visible = s2 === actCam
    }

    // 3 · the key + rim lights follow the framed station. The key grazes lower and more
    // from the side (a subject, not a flooded scene); the rim sits behind for a bright
    // edge on the glass against the dark bench.
    const Lp = presetRef.current.lights
    const k = keyRef.current
    if (k) {
      const lx = targetXRef.current
      k.position.set(lx + Lp.keyPos[0], Lp.keyPos[1], Lp.keyPos[2])
      k.target.position.set(lx + Lp.keyTarget[0], Lp.keyTarget[1], Lp.keyTarget[2])
      k.target.updateMatrixWorld()
    }
    const rim = rimRef.current
    if (rim && Lp.rim) {
      const lx = targetXRef.current
      rim.position.set(lx + Lp.rimPos[0], Lp.rimPos[1], Lp.rimPos[2])
      rim.target.position.set(lx + Lp.rimTarget[0], Lp.rimTarget[1], Lp.rimTarget[2])
      rim.target.updateMatrixWorld()
    }

    // 4 · run ONLY the active station's timeline (others idle). When a live countdown is
    // engaged it OWNS the clock: the instrument's motion tracks the digits, not a fixed
    // choreography ramp that finishes early. An instrument that stops before its own timer
    // is a lie about the step. Untimed steps (and the dev harness) keep the free-running p.
    const act = stations[activeRef.current]
    if (act) {
      if (restartRef.current) { pRef.current = 0; restartRef.current = false }
      const tm = timerRef.current
      if (Number.isFinite(PIN)) { pRef.current = PIN; act.timeline?.(PIN) }   // dev: pinned
      else {
      if (tm.hasTimer) pRef.current = tm.progress // countdown drives every timed instrument
      else pRef.current = Math.min(pRef.current + dt / STEP_DUR, 1)
      // the centrifuge needs absolute-time dock/lift choreography (a 10-min spin can't
      // glide in for two minutes), so it reads the timer directly; everything else is
      // continuous in p and tracks the countdown just by being fed the elapsed fraction.
      if (act.driveTimed && tm.hasTimer) act.driveTimed(tm, dt)
      else act.timeline?.(pRef.current)
      }
    }
    // 4c · idle instrument animations run ONLY for the active station and its immediate
    // neighbours (the ones visible during a dolly). Every other station is faded out and
    // `.visible = false` (§6, applyStationVis) — ticking its 21+ animated groups every frame
    // was pure CPU waste for geometry nobody can see. Build-once is untouched; this gates
    // only what RUNS per frame. The travelling sample (§5) ticks separately, always.
    const ai = activeRef.current
    let ticked = 0
    for (let si = 0; si < stations.length; si++) {
      if (Math.abs(si - ai) > 1) continue
      for (const u of stations[si].updatables) { u.userData?.update?.(dt); ticked++ }
    }

    // 5 · the ONE sample eases toward its world target — glides station→station.
    // While docked in a centrifuge rotor slot the rotor owns its transform, so skip
    // the glide (but still tick its liquid). Leaving a dock, an `exitLift` waypoint pulls
    // it STRAIGHT UP clear of the instrument first; once reached it resumes the glide to
    // the next seat — so the sample never teleports and never drags through the lid.
    const S = demo.getSample()
    if (S) for (const v of S.vessels) {
      if (!v.userData.docked) {
        const goal = v.userData.exitLift || v.userData.tPos
        v.position.lerp(goal, 1 - Math.pow(0.02, dt))
        if (v.userData.exitLift && v.position.distanceTo(v.userData.exitLift) < 0.06) {
          v.userData.exitLift = null // cleared the instrument — glide on to the seat
        }
      }
      v.userData.update?.(dt)
    }
    // 5b · prep vessels ride the SAME rails: each prepared mixture is CARRIED to the
    // station that draws from it, gliding exactly like the sample — never teleporting.
    for (const pv of demo.getPreps()) {
      if (pv.visible) pv.position.lerp(pv.userData.tPos, 1 - Math.pow(0.02, dt))
      pv.userData.update?.(dt)
    }

    // 6 · fade equipment by distance from the rail — active full, neighbours
    // recede into fog, and mid-dolly BOTH stations are visible.
    // A station framed from its OWN view direction (a three-quarter view) looks along the line,
    // not across it: at rest a neighbour 8.4 apart stands in its frame edge, half-faded. Once
    // the dolly has arrived, nothing but the active station is shown.
    const solo = !!(actCam && actCam.viewDir && !g.active)
    for (const st of stations) {
      const tgt = stationVisTarget(Math.abs(st.x - railX), { solo, active: st === actCam })
      st.vis = demo.lerp(st.vis, tgt, 1 - Math.pow(0.01, dt))
      if (tgt >= 1 && st.vis > 0.999) st.vis = 1
      if (tgt <= 0 && st.vis < 0.001) st.vis = 0
      applyStationVis(st)
    }
    // mirror the visible stations' lights into the constant pool, nearest the rail first
    {
      const pool = lightPoolRef.current
      let n = 0
      const near = stations.filter((st) => st.vis > 0 && st.vLights && st.vLights.length)
        .sort((a, b) => Math.abs(a.x - railX) - Math.abs(b.x - railX))
      for (const st of near) {
        for (const L of st.vLights) {
          if (n >= pool.length) break
          const P = pool[n++]
          L.getWorldPosition(P.position)
          P.color.copy(L.color); P.distance = L.distance; P.decay = L.decay
          P.intensity = L.intensity * st.vis
        }
      }
      for (; n < pool.length; n++) pool[n].intensity = 0
    }

    // dev perf probe — draw calls / triangles from the LAST render (info auto-resets each
    // frame). Cheap, harmless; read by scripts/perf-probe.mjs. Never affects the look.
    if (typeof window !== 'undefined') {
      const r = state.gl.info.render
      const p = window.__benchperf || (window.__benchperf = {}) // reuse the object — no per-frame alloc
      p.calls = r.calls; p.triangles = r.triangles; p.stations = stations.length; p.ticked = ticked
      // resource counts — sampled by scripts/frame-probe.mjs at the start and end of each
      // step animation: a count that RISES while a step animates means something is
      // created per frame and not disposed (a leak, not just slowness)
      const mem = state.gl.info.memory
      p.geometries = mem.geometries; p.textures = mem.textures
      p.programs = state.gl.info.programs ? state.gl.info.programs.length : null
      p.active = activeRef.current
      p.p = pRef.current // the active step's animation value, so a probe can see frames where motion did not advance
    }
  })

  return (
    <>
      <Lights keyRef={keyRef} rimRef={rimRef} preset={preset} />
      <Floor totalLen={totalLen} preset={preset} />
      <PerspectiveCamera ref={perspRef} makeDefault fov={FOV} near={0.1} far={260} position={[0, RAIL_Y, RAIL_Z]} />
    </>
  )
}

const ACTION_LABEL = {
  pour_add: 'Add reagent',
  pipette_mix: 'Mix',
  vortex_mix: 'Vortex',
  homogenize: 'Homogenize',
  centrifuge: 'Centrifuge',
  incubate_wait: 'Incubate',
  heat: 'Heat',
  cool_ice: 'On ice',
  transfer: 'Transfer',
  wash: 'Wash',
  discard: 'Discard',
  elute: 'Elute',
  measure: 'Measure',
  thermocycle: 'Thermocycle',
  electrophorese: 'Run gel',
  store: 'Store',
  seed: 'Seed',
  stain: 'Stain',
  generic: 'Step',
}
