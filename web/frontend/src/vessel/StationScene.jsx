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
import { FogExp2, Color, Vector3, Quaternion, Box3, Group, Mesh, RingGeometry, SphereGeometry, CylinderGeometry, PlaneGeometry, CanvasTexture, MeshStandardMaterial, MeshBasicMaterial, PointLight } from 'three'
import { reagentColor } from './theme.js'
import { buildLedger, mixColor, TIP_UL } from './liquidLedger.js'
import { tubeShape, volumeAt } from '../scene/liquidShape.js'
import { resolveRecipe, stepConditions, sampleContainerSequence, resolveRemoval, findTransferHandoffDefects, exitLiftPoint, pourPlan, removalFor, benchStaging, addSource } from './sceneRecipe.js'
import { containerContract, transferKind, sideBySide } from './containerContract.js'
import { reagentName, reagentVolume, effectiveStep, selectAlternative, hasAlternatives } from '../lib/runtime.js'
import * as demo from '../scene/demoScene.js'
import { streams } from '../scene/rng.js'
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
// ANCHOR at the pipette's top in that resting pose — the tip path itself is unchanged.
// Top = neck mouth + axis × (0.75 standoff + 0.62 tip offset + 1.58 scaled body) + margin.
function frameAngledPipette(st, disp, offsetX = 0, offsetZ = 0) {
  if (!disp || disp.approach !== 'angled') return
  const tilt = disp.tilt != null ? disp.tilt : -0.62
  const ax = Math.sin(-tilt), ay = Math.cos(-tilt)
  const reach = 0.75 + 0.62 + 1.58 + 0.25
  const top = new Vector3(offsetX + (disp.x || 0) + ax * reach, (disp.y || 0) + ay * reach, offsetZ + (disp.z || 0))
  // the stand the pipette came from stays in frame too (its base at PIP_STAND, radius ~0.55)
  const stand = new Vector3(demo.PIP_STAND.x - 0.6, 0, demo.PIP_STAND.z)
  st.frameAnchors = [...(st.frameAnchors || []), top, stand]
}

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

function computeStationFrame(st) {
  st.group.updateMatrixWorld(true)
  _frameBox.makeEmpty()
  // fit the PROPS only — the sample vessel(s) + the instrument, never the dressing.
  expandByProps(_frameBox, st.group)
  _frameBox.expandByPoint(new Vector3(0, 0, 0))   // the sample's resting column at the
  _frameBox.expandByPoint(new Vector3(0, 1.7, 0)) // local origin (base on the bench → top)
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

// ── the countdown progress DIAL — the one piece of non-diegetic UI in the scene.
// A FLAT ring on the bench (XZ plane) around the subject's base, sweeping 0→360°
// clockwise from 12 o'clock as the timer counts down. Unlit (MeshBasic, toneMapped
// off) so it reads instantly regardless of scene light, and sits proud of the bench
// so it never z-fights the floor, decal or shadow.
const DIAL_Y = 0.06          // proud of the bench (decal sits at y≈0.02) — no z-fighting
const DIAL_MARGIN = 0.38     // the ring clears the subject footprint by this much
const DIAL_ACCENT = 0x58b6a6 // the demo's teal (matches the UI timer/accent)
const DIAL_TRACK = 0x2b333d  // dim remaining-track slate
// RingGeometry authors in the XY plane; rotation.x = -π/2 lays it flat in XZ. After
// that flatten, XY-angle θ maps to world (cosθ, 0, -sinθ). The dial's TOP (θ=π/2 → -Z)
// is the FAR side, behind the subject — so a fill starting there is invisible early
// (it "starts behind the tray"). We start at the FRONT instead (θ=-π/2 → +Z, nearest
// the camera, clear of the subject) and grow CLOCKWISE (decreasing θ): the arc spans
// [-π/2 - len, -π/2] with len = fraction·2π, so the leading edge is always visible.
const DIAL_START = -Math.PI / 2  // front of the dial (nearest the camera)
function makeBenchDial(radius) {
  const th = Math.max(0.15, radius * 0.11)      // legible thickness, scales with the dial
  const rOut = radius, rIn = Math.max(0.06, radius - th)
  const g = new Group()
  const trackMat = new MeshBasicMaterial({ color: DIAL_TRACK, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false })
  const fillMat = new MeshBasicMaterial({ color: DIAL_ACCENT, transparent: true, opacity: 1, toneMapped: false, depthWrite: false })
  const track = new Mesh(new RingGeometry(rIn, rOut, 96), trackMat)
  const fill = new Mesh(new RingGeometry(rIn, rOut, 96, 1, DIAL_START, 0.0001), fillMat)
  track.rotation.x = -Math.PI / 2
  fill.rotation.x = -Math.PI / 2
  track.renderOrder = 1; fill.renderOrder = 2
  g.add(track, fill)
  g.visible = false
  let cur = -1
  g.userData.trackMat = trackMat
  g.userData.fillMat = fillMat
  g.userData.setFraction = (f) => {
    f = f < 0 ? 0 : f > 1 ? 1 : f
    if (Math.abs(f - cur) < 0.004) return // throttle the geometry rebuild
    cur = f
    fill.geometry.dispose()
    const len = Math.max(0.0001, f * Math.PI * 2)
    fill.geometry = new RingGeometry(rIn, rOut, 96, 1, DIAL_START - len, len)
    fill.rotation.x = -Math.PI / 2
  }
  return g
}

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
// a multi-reagent station's SOURCES: each opens for its own draw only (from its pass's start —
// the tip is in it by a tenth of the pass — until the tip has left), every other stays sealed.
// They were never opened: every draw went in through a closed cap.
function capSources(st, n, k, lp) {
  for (let j = 0; j < n; j++) { const b = st.reagents['r' + j] && st.reagents['r' + j].grp; if (b && b.userData.setCap) b.userData.setCap(!(j === k && lp < 0.36)) }
}

function addReagentSource(st, key, r, k, fromMix) {
  const sx = 2.0 + k * 0.95, sz = 0.7
  if (fromMix) {
    const src = demo.buildTube({ height: 1.5, radius: 0.3 })
    src.position.set(sx, 0, sz); src.userData.noFrame = true
    src.userData.setColor(r.color); src.userData.setLevel(0.55); src.userData.setLabel(r.name, r.vol || '')
    st.group.add(src); if (src.userData.update) st.updatables.push(src)
    st.reagents[key] = { grp: src, pos: new Vector3(sx, 0.9, sz) }
  } else {
    demo.addBottle(st, key, r.name, r.color, sx, sz)
  }
}

// Build a station for a step. Every action gets a timeline with VISIBLE motion
// driven by the per-step progress p (0->1): so no station is ever static.
// a station that runs P pipette passes takes longer than one pass (each pass ≈ 2.3 s)
const passDuration = (P) => STEP_DUR * Math.max(1, 1 + 0.35 * (P - 1))
// split station progress p over a list of passes → { j: pass index, lp: its own progress }
const passAt = (p, P) => { const j = Math.min(P - 1, Math.floor(p * P)); return { j, lp: P > 1 ? demo.clamp(p * P - j, 0, 1) : p } }

export function configureStation(st, o) {
  const { action, equipment, container, prevContainer, color, name, vol, seconds, startLevel, endLevel, cycles } = o
  let { startColor, endColor } = o
  // THE CONTRACT: the container owns its geometry facts (vessel geo, flat vs upright,
  // seat height, dispense point, tip-vs-aspirate). No more microtube-shaped defaults.
  const C = containerContract(container)
  const vessel = C.vessel
  const removal = C.emptyMotion // 'tip' (tube) vs 'aspirate' (plate/membrane — never tipped)
  const S = demo.getSample()
  const BT = demo.BLOCK_TOP
  const FLAT = C.flat
  // BENCH rest comes from the CONTRACT — the vessel's base sits on the bench (y=0 for
  // both upright and flat; their origins are at the base). Stations that place the
  // vessel ON equipment (bath/ice/rotor/…) still pass their own height to seat().
  const SEAT_Y = C.seat.y

  // ── VOLUMES (liquidLedger.js): what this station's vessels hold, start → end, and the ops
  // between. A vessel with a drawn interior takes a volume (setVolume); a surface (slide,
  // membrane, gel, agar) keeps the demo's levels. Without a ledger (the dev matrix): the demo's levels.
  const Lq = o.liq || null
  const VOL = !!(Lq && S[vessel] && S[vessel].userData.setVolume)
  const ulAt = (id, side) => (Lq && Lq[side][id] ? Lq[side][id].ul : 0)
  const colAt = (id, side, dflt) => (Lq && Lq[side][id] && Lq[side][id].color != null ? Lq[side][id].color : dflt)
  const startUl = ulAt(vessel, 'start'), endUl = ulAt(vessel, 'end')
  if (VOL) { startColor = colAt(vessel, 'start', startColor); endColor = colAt(vessel, 'end', endColor) }
  const amount = (v, ul, level) => { if (Lq && v.userData.setVolume) v.userData.setVolume(ul); else v.userData.setLevel(level) }
  // a spin column always carries its collection tube's flow-through as the ledger has it
  const dressFlow = (side) => {
    const c = S.column
    if (Lq && c && c.userData.setFlow) { c.userData.setFlow(ulAt('flow', side)); c.userData.setFlowColor(colAt('flow', side, null)) }
  }
  // this station's pipette passes: one entry per tip, in order (an op of n passes is n entries)
  const passList = (ops) => ops.flatMap((op) => Array.from({ length: op.passes || 1 }, () => ({ op, each: op.ul / (op.passes || 1) })))

  // seat the travelling sample WITHOUT resetting its contents: it enters at the
  // carried-in (start) state, so it continues from where the last step left it.
  const seat = (x, y, z) => {
    S.only(vessel)
    const v = S[vessel]
    if (name) v.userData.setLabel(name, vol || '')
    v.userData.setColor(startColor)
    amount(v, startUl, startLevel)
    dressFlow('start')
    if (v.userData.setCap) v.userData.setCap(true) // a capped vessel arrives SEALED; a pour opens it
    v.visible = true
    v.rotation.set(0, 0, 0)
    v.scale.setScalar(1) // clear any per-station scale (e.g. the thermocycler's shrunk tube)
    S.at(v, st.x + x, FLAT ? SEAT_Y : y, z)   // a flat vessel rests on the bench at its contract seat (0 left a membrane / slide resting on nothing)
    return v
  }

  // evolve the sample's level (and, past the midpoint, its colour) from the
  // carried-in start toward this step's end, paced by p. Returns the base level
  // so callers can add a surface ripple on top.
  // (a surface ripple rides on a demo level only: a volume is a volume)
  const evolve = (p, ripple = 0) => {
    const v = S[vessel]
    const e = demo.easeInOut(demo.clamp(p, 0, 1))
    const base = demo.lerp(startLevel, endLevel, e)
    if (VOL) v.userData.setVolume(demo.lerp(startUl, endUl, e))
    else v.userData.setLevel(base + ripple)
    if (p > 0.5) v.userData.setColor(endColor)
    return base
  }

  // where an add draws from: the sample's own TUBE when the reagent is the sample, nothing
  // when the step collects samples from outside the bench, else the reagent's bottle
  const source = (action === 'pour_add' || action === 'pipette_mix')
    ? addSource({ text_en: o.text, reagents: (o.reagents || []).map((r) => ({ name: r.name })) }) : 'bottle'
  const pour = action === 'pour_add'
    ? (Lq ? (() => { const po = Lq.ops.filter((x) => x.method === 'pour'); const fromBottle = po.filter((x) => x.op === 'add' && x.from === 'bottle')
        return { pour: po.length > 0, reagentIndex: fromBottle.length ? Math.max(0, fromBottle[0].ri ?? 0) : -1, ops: po, bottleOps: fromBottle } })()
      : pourPlan({ text_en: o.text, reagents: (o.reagents || []).map((r) => ({ volume: r.vol })) }))
    : null
  // the ledger's adds into the sample at this station (from a bottle, a carried mix, outside)
  const addOps = Lq ? Lq.ops.filter((x) => (x.op === 'add' && x.to === vessel) || (x.op === 'move' && x.to === vessel && String(x.from).startsWith('prep:'))) : []
  if (action === 'pour_add' && source === 'none') {
    // COLLECTING samples: the sample arrives from outside the bench (a blood draw) — no
    // bottle and no pipette are invented; the vessel simply receives it
    st.enter = () => seat(0, SEAT_Y, 0)
    st.timeline = (p) => { evolve(demo.easeInOut(demo.clamp((p - 0.2) / 0.6, 0, 1))) }
  } else if (source === 'sample_tube') {
    // the reagent IS the sample (e.g. "load the denatured protein samples into the wells"):
    // the pipette draws from the samples' own TUBE — a bottle of samples would be invented
    const tube = demo.buildTube({ height: 1.7, radius: 0.32, color: endColor, label: '' })
    // VOLUMES: the samples' tube holds what a 0.6 level draws (the samples' stock is not stated),
    // or the carried mix's volume when the step draws from one; it drops by what each pass draws
    const draws = Lq ? addOps : []
    const P = passList(draws).length
    const total = draws.reduce((a, x) => a + x.ul, 0)
    const srcUl = draws.some((x) => String(x.from).startsWith('prep:')) ? ulAt(draws[0].from, 'start') : volumeAt(tubeShape(1.7, 0.32), 0.6)
    const addColor = draws.length ? draws.reduce((c, x, k) => (k ? mixColor(c, draws.slice(0, k).reduce((a, y) => a + y.ul, 0), x.color, x.ul) : x.color), null) : endColor
    demo.stationReagent(st, SEAT_Y, { key: 'r', blabel: '', color: Lq && draws.length ? addColor : endColor, vessel, vlabel: name || '', vsub: vol || '', cStart: startColor, cEnd: endColor, lStart: startLevel, lEnd: endLevel, dispense: C.dispense, entry: C.entryPoint,
      ...(Lq && P ? { passes: P, each: total / P, ulStart: startUl, srcTube: tube, srcUl } : {}) })
    if (Lq && P) st.duration = passDuration(P)
    const src = st.reagents.r
    src.grp.visible = false
    tube.position.copy(src.grp.position); tube.userData.noFrame = true
    if (Lq && P) tube.userData.setVolume(srcUl); else tube.userData.setLevel?.(0.6)
    st.group.add(tube); if (tube.userData.update) st.updatables.push(tube)
    const baseTl = st.timeline
    st.timeline = (p) => { baseTl(p); if (!(Lq && P)) tube.userData.setLevel?.(demo.lerp(0.6, 0.4, demo.clamp(p / 0.3, 0, 1))) }
  } else if (pour && pour.pour) {
    // #13 — a POUR: the stated mL reagent's BOTTLE is tipped into the vessel; no pipette.
    // A pour that states no reagent ("pour the agarose into the casting tray") names no
    // bottle, so none is invented: the vessel simply fills.
    const C0 = C.dispense || { x: 0, z: 0 }
    const mouth = {
      x: C0.x || 0, z: C0.z || 0,
      y: (C0.approach === 'angled' && C0.y != null) ? C0.y : SEAT_Y + (C0.y != null ? C0.y : 0.9),
    }
    const reag = pour.reagentIndex >= 0 ? (Lq ? { ...o.reagents[pour.reagentIndex], color: pour.bottleOps.reduce((c, x, k) => (k ? mixColor(c, pour.bottleOps.slice(0, k).reduce((a, y) => a + y.ul, 0), x.color, x.ul) : x.color), null) } : o.reagents[pour.reagentIndex]) : null
    // VOLUMES: the pour holds its tilt for exactly as long as its volume takes at POUR_UL_PER_S
    // (the rest of the choreography keeps its timing): p is remapped so the stream runs T seconds
    const T = Lq ? Math.max(Lq.pourSeconds, 1 / 60) : 0
    const poured = Lq ? pour.ops.reduce((a, x) => a + x.ul, 0) : 0
    const PRE = 0.5 * STEP_DUR, POST = 0.2 * STEP_DUR
    if (Lq) st.duration = PRE + T + POST
    const pourP = (p) => { const t = p * (PRE + T + POST); return t < PRE ? t / STEP_DUR : t < PRE + T ? 0.5 + 0.3 * (t - PRE) / T : 0.8 + (t - PRE - T) / STEP_DUR }
    let bottle = null
    if (reag) {
      demo.addBottle(st, 'pour', '', reag.color, 2.0, 0.7)
      bottle = st.reagents.pour.grp
    }
    const H = 1.3, TH = 1.9                                   // bottle height, pour tilt (rad)
    const M = { x: mouth.x, y: mouth.y + 0.35, z: mouth.z }   // where the bottle mouth pours from
    const tiltBase = { x: M.x + H * Math.sin(TH), y: M.y - H * Math.cos(TH), z: M.z }
    const HOME = { x: 2.0, y: 0, z: 0.7 }
    // the bottle's cap comes OFF before the pour and is set down on the bench beside the
    // bottle (the bottle's own cap follows the bottle's tilt, so it is hidden and this
    // identical cap — starting exactly on the neck — carries its role)
    let cap = null
    const CAP_ON = { x: HOME.x, y: 1.3 + 0.11 + 0.021, z: HOME.z }   // on the neck's ring (0.021 lower sat in it)
    const CAP_BENCH = { x: HOME.x + 0.6, y: 0.11, z: HOME.z + 0.35 }
    if (bottle) {
      cap = bottle.userData.cap.clone()
      bottle.userData.cap.visible = false
      st.group.add(cap)
    }
    let stream = null
    if (bottle) {
      stream = new Mesh(new CylinderGeometry(0.035, 0.05, 0.45, 12), new MeshStandardMaterial({ color: reag.color, roughness: 0.3, transparent: true, opacity: 0.8 }))
      stream.position.set(M.x, M.y - 0.22, M.z); stream.visible = false
      stream.userData.auditKind = 'fluid'   // metadata for the dev collision audit: a stream, not a solid
      st.group.add(stream)
    }
    st.enter = () => {
      seat(0, SEAT_Y, 0)
      if (bottle) { bottle.position.set(HOME.x, HOME.y, HOME.z); bottle.rotation.set(0, 0, 0); cap.position.set(CAP_ON.x, CAP_ON.y, CAP_ON.z); if (Lq) bottle.userData.setLevel?.(1) }
    }
    // the stream's share poured so far: a constant flow while the bottle is tipped
    const flowed = (p) => demo.clamp((p - 0.5) / 0.3, 0, 1)
    const fill = (q) => {
      const v = S[vessel]
      if (VOL) { v.userData.setVolume(startUl + (endUl - startUl) * q); v.userData.setColor(mixColor(startColor, startUl, reag ? reag.color : endColor, (endUl - startUl) * q)) }
      else evolve(q)
    }
    st.timeline = (p0) => {
      const p = Lq ? pourP(p0) : p0
      const v = S[vessel]
      const seg = (a, b) => demo.easeInOut(demo.clamp((p - a) / (b - a), 0, 1))
      if (v.userData.setCap) v.userData.setCap(!(p > 0.2 && p < 0.95)) // a capped vessel opens for the pour
      if (!bottle) { if (Lq) fill(flowed(p)); else evolve(seg(0.2, 0.85)); return }
      // 0-0.1 · uncap: the cap lifts off the neck, carries over, and is set on the bench
      if (p < 0.03) cap.position.set(CAP_ON.x, demo.lerp(CAP_ON.y, CAP_ON.y + 0.3, seg(0, 0.03)), CAP_ON.z)
      else if (p < 0.07) { const q = seg(0.03, 0.07); cap.position.set(demo.lerp(CAP_ON.x, CAP_BENCH.x, q), CAP_ON.y + 0.3, demo.lerp(CAP_ON.z, CAP_BENCH.z, q)) }
      else cap.position.set(CAP_BENCH.x, demo.lerp(CAP_ON.y + 0.3, CAP_BENCH.y, seg(0.07, 0.1)), CAP_BENCH.z)
      const LIFT = tiltBase.y + 0.3
      let x = HOME.x, y = HOME.y, z = HOME.z, rot = 0
      if (p < 0.1) { /* bottle waits while it is uncapped */ }
      else if (p < 0.16) { y = demo.lerp(HOME.y, LIFT, seg(0.1, 0.16)) }                  // straight up
      else if (p < 0.32) { const q = seg(0.16, 0.32); x = demo.lerp(HOME.x, tiltBase.x, q); z = demo.lerp(HOME.z, tiltBase.z, q); y = LIFT }
      else if (p < 0.38) { x = tiltBase.x; z = tiltBase.z; y = demo.lerp(LIFT, tiltBase.y, seg(0.32, 0.38)) }
      else if (p < 0.5) { x = tiltBase.x; y = tiltBase.y; z = tiltBase.z; rot = TH * seg(0.38, 0.5) }   // tip over
      else if (p < 0.8) { x = tiltBase.x; y = tiltBase.y; z = tiltBase.z; rot = TH }                    // pour
      else if (p < 0.88) { x = tiltBase.x; y = tiltBase.y; z = tiltBase.z; rot = TH * (1 - seg(0.8, 0.88)) }
      else { const q = seg(0.88, 1); x = demo.lerp(tiltBase.x, HOME.x, q); z = demo.lerp(tiltBase.z, HOME.z, q); y = demo.lerp(tiltBase.y, HOME.y, q) }
      bottle.position.set(x, y, z); bottle.rotation.set(0, 0, rot)
      if (Lq) bottle.userData.setLevel?.(1 - poured * flowed(p) / bottle.userData.stockUl)   // falls by what it poured
      else bottle.userData.setLevel?.(1 - 0.3 * seg(0.5, 0.8))      // the bottle empties as it pours
      stream.visible = p >= 0.5 && p < 0.8
      if (Lq) fill(flowed(p)); else evolve(seg(0.5, 0.8))       // fills only while it pours
    }
  } else if (action === 'pour_add') {
    const reags = o.reagents || []
    // draws FROM a prepared mixture ("apply the DNase I mixture …") → the source is the
    // tube you made, not a bottle from nowhere. The parsed `draws_from` is authoritative;
    // the name heuristic is a fallback for data parsed before Stage 34.
    const fromMix = reags.length === 1 && (!!o.drawsFrom
      || /\bmix\b|mixture|master ?mix|working solution/i.test(reags[0].name || ''))
    // the ONE persistent prep vessel this step consumes (Stage 36) — carried here, drawn from.
    const prep = (fromMix && o.drawsFrom) ? demo.getPrep(o.drawsFrom) : null
    if (reags.length <= 1 && !fromMix) {
      // single-reagent path: resident pipette rig + bottle; fill ramps in the dispense window —
      // with volumes, one pass per tip of the stated draw, the vessel rising by what was dispensed
      const P = passList(addOps).length, add = addOps[0]
      demo.stationReagent(st, SEAT_Y, { key: 'r', blabel: '', color: add ? add.color : endColor, vessel, vlabel: name || '', vsub: vol || '', cStart: startColor, cEnd: endColor, lStart: startLevel, lEnd: endLevel, dispense: C.dispense, entry: C.entryPoint,
        ...(Lq && P ? { passes: P, each: add.ul / P, ulStart: startUl } : {}) })
      if (Lq && P) st.duration = passDuration(P)
      frameAngledPipette(st, C.dispense, 0)
    } else if (prep) {
      // DRAW FROM THE CARRIED MIX (Stage 36). The prep tube was made at its own station and
      // is glided HERE (placePreps + the frame loop) — one object, moved, not a copy. The
      // pipette draws OUT of it into the sample, and its level DROPS as it is used.
      const disp = C.dispense || { x: 0, z: 0 }
      const toY = (disp.approach === 'angled' && disp.y != null) ? disp.y : SEAT_Y
      const draw = { x: 2.0, y: 0.9, z: 0.7 }          // where the tube parks + the pipette dips
      const streamColor = prep.userData.mixColor != null ? prep.userData.mixColor : reags[0].color
      const PREP_FULL = 0.62
      st.drawsFromId = o.drawsFrom
      st.drawPos = { x: st.x + draw.x, y: 0, z: draw.z } // WORLD seat the carried tube glides to
      demo.addPipetteRig(st)
      const mv = Lq ? addOps.find((x) => x.from === 'prep:' + o.drawsFrom) : null
      const P = mv ? mv.passes || 1 : 1, each = mv ? mv.ul / P : 0
      const prepUl = Lq ? ulAt('prep:' + o.drawsFrom, 'start') : 0
      if (mv) st.duration = passDuration(P) + 0.25 * STEP_DUR
      st.enter = () => { seat(0, SEAT_Y, 0); demo.pipRest(st); if (mv) prep.userData.setVolume(prepUl); else prep.userData.setLevel(PREP_FULL) }
      st.timeline = (p) => {
        const v = S[vessel]
        if (v.userData.setCap) v.userData.setCap(!(p > 0.1 && p < 0.95)) // uncap to receive
        // the CARRIED prep arrives during the first quarter (its trip from the station that made
        // it): the pass waits for it — the pipette used to dive in while the tube was in the air
        const q = demo.clamp((p - 0.25) / 0.75, 0, 1)
        if (mv) {
          const { j, lp } = passAt(q, P)
          demo.pipetteRun(st, new Vector3(draw.x, draw.y, draw.z), { x: disp.x, y: toY, z: disp.z }, lp,
            { color: mv.color, tipUl: each, approach: disp.approach, tilt: disp.tilt, depth: disp.depth, dipDepth: C.entryPoint })
          const added = (j + demo.dispenseProgress(lp)) * each
          if (VOL) { v.userData.setVolume(startUl + added); v.userData.setColor(mixColor(startColor, startUl, mv.color, added)) }
          else { v.userData.setLevel(demo.lerp(startLevel, endLevel, added / mv.ul)); v.userData.setColor(endColor) }
          prep.userData.setVolume(prepUl - (j + demo.drawProgress(lp)) * each)   // drops as the tip draws
          return
        }
        demo.pipetteRun(st, new Vector3(draw.x, draw.y, draw.z), { x: disp.x, y: toY, z: disp.z }, q,
          { color: streamColor, fill: 0.8, approach: disp.approach, tilt: disp.tilt, depth: disp.depth, dipDepth: C.entryPoint })
        const done = demo.dispenseProgress(q)
        v.userData.setLevel(demo.lerp(startLevel, endLevel, done))
        v.userData.setColor(endColor)
        prep.userData.setLevel(demo.lerp(PREP_FULL, 0.1, demo.easeInOut(demo.clamp(q, 0, 1)))) // drained as used
      }
    } else {
      // N reagents → N pipette passes INTO the sample (one per reagent, from its own source).
      const disp = C.dispense || { x: 0, z: 0 }
      const toY = (disp.approach === 'angled' && disp.y != null) ? disp.y : SEAT_Y
      demo.addPipetteRig(st)
      reags.forEach((r, k) => addReagentSource(st, 'r' + k, r, k, fromMix))
      st.enter = () => { seat(0, SEAT_Y, 0); demo.pipRest(st) }
      const passes = Lq ? passList(addOps) : []
      if (passes.length) st.duration = passDuration(passes.length)
      st.timeline = (p) => {
        const v = S[vessel]
        if (v.userData.setCap) v.userData.setCap(!(p > 0.1 && p < 0.95)) // uncap for the passes
        if (passes.length) {
          const { j, lp } = passAt(p, passes.length), cur = passes[j], k = Math.min(reags.length - 1, cur.op.ri ?? 0)
          capSources(st, reags.length, k, lp)
          demo.pipetteRun(st, st.reagents['r' + k].pos, { x: disp.x, y: toY, z: disp.z }, lp,
            { color: cur.op.color, tipUl: cur.each, approach: disp.approach, tilt: disp.tilt, depth: disp.depth, dipDepth: C.entryPoint })
          let ul = startUl, c = startColor
          for (let i = 0; i <= j; i++) { const a = i < j ? passes[i].each : demo.dispenseProgress(lp) * passes[i].each; c = mixColor(c, ul, passes[i].op.color, a); ul += a }
          if (VOL) { v.userData.setVolume(ul); v.userData.setColor(c) }
          else { v.userData.setLevel(demo.lerp(startLevel, endLevel, (j + demo.dispenseProgress(lp)) / passes.length)); v.userData.setColor(reags[k].color) }
          return
        }
        const n = reags.length, seg = 1 / n
        const k = Math.min(n - 1, Math.floor(p / seg))
        const lp = demo.clamp((p - k * seg) / seg, 0, 1)
        capSources(st, n, k, lp)
        demo.pipetteRun(st, st.reagents['r' + k].pos, { x: disp.x, y: toY, z: disp.z }, lp,
          { color: reags[k].color, fill: 0.8, approach: disp.approach, tilt: disp.tilt, depth: disp.depth, dipDepth: C.entryPoint })
        const done = (k + demo.dispenseProgress(lp)) / n
        v.userData.setLevel(demo.lerp(startLevel, endLevel, done))
        v.userData.setColor(reags[Math.min(k, n - 1)].color)
      }
    }
  } else if (action === 'prepare') {
    // NOT EVERY STEP HAPPENS TO THE SAMPLE. Combine the reagents in a SEPARATE vessel, on
    // the side; the SAMPLE sits visibly idle and untouched. The prep vessel is the subject.
    // It is a SECOND TRAVELLING OBJECT (Stage 36): built ONCE here, scene-parented so it can
    // be CARRIED later to the step that draws from it — never rebuilt, never teleported.
    const reags = (o.reagents && o.reagents.length) ? o.reagents : [{ name, vol, color: endColor }]
    const prepId = o.produces || ('prep_' + Math.round(st.x))
    const PREP_FULL = 0.62
    const prep = demo.makePrep(prepId, { height: 1.7, radius: 0.34 })
    const home = { x: st.x + 0.4, y: 0, z: 0.2 }
    prep.position.set(home.x, home.y, home.z); prep.userData.tPos.copy(prep.position)
    prep.userData.mixColor = reags[reags.length - 1].color // the mixture's settled colour
    prep.userData.setColor(reags[0].color); prep.userData.setLevel(0)
    prep.userData.setLabel(name || 'mixture', vol || '')
    st.prep = prep; st.prepId = prepId; st.prepHome = home; st.prepFull = PREP_FULL
    demo.addPipetteRig(st)
    reags.forEach((r, k) => demo.addBottle(st, 'r' + k, r.name, r.color, 2.2 + k * 0.95, 0.7))
    // the prep sits at (0.4, ·, 0.2) LOCAL to this station while it is being made, so the
    // bottles dispense straight into it (world == home because it is parked here).
    const DIP = { x: 0.4, y: SEAT_Y, z: 0.2 }
    // the idle sample lives beside the prep, showing its carried contents — untouched.
    const idleSample = () => {
      S.only(vessel)
      const sv = S[vessel]
      sv.userData.setColor(startColor); amount(sv, startUl, startLevel)
      sv.visible = true; sv.rotation.set(0, 0, 0); sv.scale.setScalar(1)
      S.snapTo(sv, st.x - 2.0, SEAT_Y, -0.1) // idle beside the prep; never clobber global snap
      return sv
    }
    const pid = 'prep:' + prepId
    const passes = Lq ? passList(Lq.ops.filter((x) => x.op === 'add' && x.to === pid)) : null
    if (passes && passes.length) st.duration = passDuration(passes.length)
    st.enter = () => { idleSample(); if (passes) prep.userData.setVolume(0); else prep.userData.setLevel(0); prep.userData.setColor(reags[0].color); demo.pipRest(st) }
    st.timeline = (p) => {
      const sv = S[vessel]
      sv.userData.setColor(startColor); amount(sv, startUl, startLevel) // untouched, held
      if (passes) {
        if (!passes.length) { capSources(st, reags.length, -1, 1); return }   // nothing liquid to add (a plate warming up)
        const { j, lp } = passAt(p, passes.length), cur = passes[j], k = Math.min(reags.length - 1, cur.op.ri ?? 0)
        capSources(st, reags.length, k, lp)
        demo.pipetteRun(st, st.reagents['r' + k].pos, DIP, lp, { color: cur.op.color, tipUl: cur.each, dipDepth: 0.62 })
        let ul = 0, c = null
        for (let i = 0; i <= j; i++) { const a = i < j ? passes[i].each : demo.dispenseProgress(lp) * passes[i].each; c = mixColor(c, ul, passes[i].op.color, a); ul += a }
        prep.userData.setVolume(ul); if (c != null) prep.userData.setColor(c)
        return
      }
      const n = reags.length, seg = 1 / n
      const k = Math.min(n - 1, Math.floor(p / seg))
      const lp = demo.clamp((p - k * seg) / seg, 0, 1)
      capSources(st, n, k, lp)
      demo.pipetteRun(st, st.reagents['r' + k].pos, DIP, lp, { color: reags[k].color, fill: 0.8, dipDepth: 0.62 })
      const done = (k + demo.dispenseProgress(lp)) / n
      prep.userData.setLevel(done * PREP_FULL)
      prep.userData.setColor(reags[Math.min(k, n - 1)].color)
    }
  } else if (action === 'pipette_mix') {
    // resuspend / mix by pipetting: the pipette bobs STRAIGHT down into the tube
    // and back, aspirating + dispensing. (Do NOT reuse pipetteRun here — that's a
    // transfer arc, and looping it in place makes the pipette leap up and teleport.)
    const TOP = SEAT_Y + 1.35 // raised, tip clear of the tube (kept low — HUD clearance)
    const BOT = SEAT_Y + 0.8 // plunged, tip in the liquid
    demo.addPipetteRig(st)
    st.enter = () => { seat(0, SEAT_Y, 0); if (st.pip) { st.pip.position.set(0, TOP, 0); st.pip.userData.setFluid(0) } }
    st.timeline = (p) => {
      const pip = st.pip
      if (pip) {
        const cp = (p * 3) % 1 // 3 mixing strokes
        const dip = Math.sin(cp * Math.PI) // 0→1→0, CONTINUOUS across the reset (no jump)
        pip.position.set(0, demo.lerp(TOP, BOT, dip), 0)
        pip.userData.setColor(endColor)
        if (VOL) { const held = (Lq.mixUl || 0) * dip; pip.userData.setTipVolume(held); S[vessel].userData.setVolume(startUl - held) }   // drawn at the bottom of each stroke, back on the way up
        else pip.userData.setFluid((1 - dip) * 0.6) // draw up when raised, expel when plunged
      }
      if (VOL) return
      evolve(p, Math.sin(p * 26) * 0.02) // surface ripple over carried level
    }
  } else if (action === 'vortex_mix') {
    if (FLAT) {
      // A FLAT vessel (plate / dish / membrane / slide / gel / culture flask) can't press
      // into a tube vortexer, and TILTING one dips a corner THROUGH THE FLOOR. Agitate it in
      // place instead: a tight in-plane orbital jiggle on the bench — stays flat, never leaves
      // the surface, reads as mixing. No tube-vortexer device (it doesn't belong under a plate).
      st.enter = () => seat(0, SEAT_Y, 0)
      st.timeline = (p) => {
        const v = S[vessel]
        evolve(p)
        v.rotation.set(0, 0, 0) // stay flat on the bench
        const a = p * 40
        S.at(v, st.x + Math.cos(a) * 0.05, SEAT_Y, Math.sin(a) * 0.05)
      }
    } else {
      // a real VORTEX MIXER; the tube presses into its rubber cup and shakes.
      const mixer = demo.buildVortexMixer()
      st.group.add(mixer)
      st.updatables.push(mixer)
      st.enter = () => seat(0, 0.82, 0) // seated in the mixer cup
      st.timeline = (p) => {
        const v = S[vessel]
        evolve(p) // holds the carried contents (start == end for a vortex)
        v.rotation.z = Math.sin(p * 46) * 0.16 // rapid orbital wobble in the cup
        v.rotation.x = Math.cos(p * 46) * 0.08
      }
    }
  } else if (action === 'homogenize') {
    // MANUAL homogenization: a syringe dips into the tube and the plunger pumps
    // repeatedly (pass the lysate through a 20-21 G needle). NO centrifuge.
    const syr = demo.buildSyringe()
    syr.userData.setColor(endColor)
    syr.position.set(0.1, SEAT_Y + 0.05, 0.1) // beside the tube, needle dipping toward its mouth
    syr.rotation.z = -0.3 // tilt like a hand holding it
    syr.scale.setScalar(0.8)
    st.group.add(syr)
    st.updatables.push(syr)
    st.enter = () => seat(0, SEAT_Y, 0)
    st.timeline = (p) => {
      const passes = 5 // "pass 5 times through the needle"
      const cp = (p * passes) % 1
      syr.userData.setPlunge(cp < 0.5 ? cp * 2 : (1 - cp) * 2) // press down then draw up
      syr.userData.setColor(endColor)
      evolve(p, Math.sin(p * 34) * 0.02) // agitation ripple over carried level
    }
  } else if (action === 'discard') {
    // remove liquid — motion follows the CURRENT container: a tube TIPS into the
    // waste; a plate/dish/membrane is ASPIRATED (pipette suck-out — never tip it).
    // The step's own "aspirate" makes even a tube a pipette removal (#14).
    if (removalFor(container, o.text) === 'aspirate') {
      // resident pipette sucks the liquid out (its stand comes with the rig — a
      // genuine pipetting station); the level drains as it draws up.
      // aspirate AT the container's dispense point (a well / the flask surface),
      // descending to just above THAT surface — not a fixed tube height.
      const dx = C.dispense.x, dz = C.dispense.z
      const hiY = FLAT ? 1.9 : SEAT_Y + 1.35
      const loY = FLAT ? C.dispense.y + 0.12 : SEAT_Y + 0.85
      demo.addPipetteRig(st)
      st.enter = () => { seat(0, SEAT_Y, 0); if (st.pip) { st.pip.position.set(dx, hiY, dz); st.pip.userData.setFluid(0) } }
      st.timeline = (p) => {
        if (st.pip) {
          st.pip.position.set(dx, demo.lerp(hiY, loY, demo.easeInOut(demo.clamp(p * 1.4, 0, 1))), dz)
          st.pip.userData.setColor(endColor)
          if (Lq) st.pip.userData.setTipVolume(Math.min(TIP_UL, startUl) * Math.sin(Math.PI * demo.easeInOut(demo.clamp(p, 0, 1))))   // in transit, never held
          else st.pip.userData.setFluid(demo.easeInOut(demo.clamp(p, 0, 1)) * 0.7)
        }
        evolve(p) // drain (no tipping)
      }
    } else {
      const waste = demo.buildWaste()
      waste.position.set(1.3, 0, 0.6)
      waste.scale.setScalar(0.9)
      st.group.add(waste)
      st.updatables.push(waste)
      st.enter = () => seat(0, 0.7, 0)
      st.timeline = (p) => {
        const e = demo.easeInOut(demo.clamp(p, 0, 1))
        S[vessel].rotation.z = -e * 1.2 // tip toward the waste
        evolve(p) // drain from the carried level down to the discard end level
      }
    }
  } else if (action === 'transfer') {
    // A transfer moves the sample from container A (prev) into B (this step). TWO kinds,
    // told apart by the CONTRACT (nestsInto), never by a hardcoded pair:
    //  • VESSEL MOVE — A nests into B (a spin column into a clean tube): lift & seat A
    //    into B. Played by the shared hand-off wrapper below; here we just rest in B.
    //  • CONTENTS POUR — A does NOT nest into B (tube→column, flask→tube): the LIQUID
    //    moves, both vessels side by side, A drains as B fills. This is the whole point
    //    of the step, so we choreograph it here and SKIP the vessel-swap wrapper.
    const prevC2 = prevContainer ? containerContract(prevContainer) : null
    const kind = transferKind(prevContainer, container) // 'nest' | 'contents' | 'rest'
    if (kind === 'nest' && prevC2) {
      // VESSEL MOVE — you pick up the COLUMN itself and drop it into a fresh tube. The
      // liquid does not move (it is in the column's bed); no pipette, no level change.
      configureNestMove(st, S, {
        columnKey: prevC2.vessel, tubeKey: vessel,
        columnSeatY: prevC2.seat.y, tubeSeatY: SEAT_Y,
        color: startColor, level: startLevel, // the column KEEPS its carried contents
        vols: Lq ? { column: ulAt(prevC2.vessel, 'start'), columnColor: colAt(prevC2.vessel, 'start', startColor), tube: ulAt(vessel, 'start'), flow: ulAt('flow', 'start'), flowColor: colAt('flow', 'start', null) } : null,
      })
      st._skipHandoff = true // the nest IS the transition; no lift/settle swap or fill
    } else if (kind === 'contents' && prevC2) {
      // CONTENTS MOVE — the sample's LIQUID goes A→B. You do not tip 700 µl of lysate
      // from a tube into a spin column; you aspirate it and dispense it. So this is a
      // PIPETTE RUN, never a stream bridging the two vessels (a free-standing stream
      // reads as a wire, and nothing at a bench moves liquid through open air).
      configurePipetteTransfer(st, S, {
        fromKey: prevC2.vessel, toKey: vessel,
        srcSeatY: prevC2.seat.y, dstSeatY: SEAT_Y,
        srcDisp: prevC2.dispense, dstDisp: C.dispense, dstEntry: C.entryPoint,
        srcToken: prevContainer, dstToken: container,
        color: endColor, startLevel, endLevel, name, vol,
        move: Lq ? Lq.ops.find((x) => x.op === 'move' && x.from === prevC2.vessel && x.to === vessel) || null : null,
        vols: Lq ? { a: ulAt(prevC2.vessel, 'start'), aColor: colAt(prevC2.vessel, 'start', startColor), b: ulAt(vessel, 'start'), bColor: colAt(vessel, 'start', null) } : null,
      })
      if (Lq && st.passes) st.duration = passDuration(st.passes)
      st._skipHandoff = true // the pipette run IS the transition; no lift/settle swap
    } else if (kind === 'place' && prevC2) {
      // A gel or membrane on either side (#5): nothing is pipetted. Both vessels rest side
      // by side, spaced by footprint; the destination takes on the carried contents (a
      // membrane's bands appear) — no rig, no drop, no stream.
      const { AX, BX, srcFoot, dstFoot } = sideBySide(prevContainer, container)
      st.frameAnchors = [
        new Vector3(AX + srcFoot.minX, 0, 0), new Vector3(AX + srcFoot.maxX, 1.2, 0),
        new Vector3(BX + dstFoot.minX, 0, 0), new Vector3(BX + dstFoot.maxX, 1.2, 0),
      ]
      st.enter = () => {
        S.only(vessel)
        const a = S[prevC2.vessel], b = S[vessel]
        a.visible = true; b.visible = true
        a.rotation.set(0, 0, 0); b.rotation.set(0, 0, 0)
        a.userData.setColor?.(startColor); a.userData.setLevel?.(startLevel)
        b.userData.setColor?.(endColor); b.userData.setLevel?.(0)
        S.snapTo(a, st.x + AX, prevC2.seat.y, 0)
        S.snapTo(b, st.x + BX, SEAT_Y, 0)
      }
      st.timeline = (p) => {
        const b = S[vessel]
        S[prevC2.vessel].visible = true
        b.userData.setColor?.(endColor)
        b.userData.setLevel?.(demo.lerp(0, endLevel, demo.easeInOut(demo.clamp((p - 0.2) / 0.6, 0, 1))))
      }
      st._skipHandoff = true
    } else {
      // A transfer that is NEITHER a nest NOR a container change fell through to a plain
      // fill. That is an ADD wearing a transfer's name — surface it loudly (this silent
      // fallthrough is exactly how the fake step-20 hid). Same-vessel aliquots land here.
      console.warn(`[benchpilot] transfer step ${name || ''} did not resolve to a nest or a ` +
        `container move (prev=${prevContainer}, to=${container}) — rendering a rest, not a fill. ` +
        `If this should MOVE the sample, its container/nestsIn contract is wrong.`)
      st.enter = () => seat(0, SEAT_Y, 0)
      st.timeline = () => { amount(S[vessel], startUl, startLevel) } // hold — never fill on a transfer
    }
  } else if (equipment === 'centrifuge' || action === 'elute') {
    // benchtop centrifuge, rotor spins over p (verbatim stationSpin). The sample
    // arrives at its carried level and spins down to the chained end level.
    const toFlow = Lq ? Lq.ops.filter((x) => x.op === 'move' && x.to === 'flow').reduce((a, x) => a + x.ul, 0) : 0
    demo.stationSpin(st, BT, { vessel, vlabel: name || '', vsub: vol || '', color: endColor, lStart: startLevel, lEnd: endLevel, cenLabel: 'Centrifuge', cenSub: vol || '', seconds,
      ...(VOL ? { vol: { start: startUl, end: endUl },
        flow: vessel === 'column' ? { start: ulAt('flow', 'start'), peak: ulAt('flow', 'start') + toFlow, end: ulAt('flow', 'end'), startColor: colAt('flow', 'start', null),
          color: mixColor(colAt('flow', 'start', null), ulAt('flow', 'start'), startColor, toFlow) } : null } : {}) })
  } else if ((action === 'incubate_wait' && equipment !== 'ice_bucket') || (action === 'store' && equipment === 'co2_incubator')) {
    // EQUIPMENT CONTRACT: the instrument was resolved from the container AND the step's
    // stated conditions (resolveRecipe) — a tube BLOCK only when one is named, a plate
    // SHAKER only under stated agitation, a CO₂ INCUBATOR for a culture vessel at body
    // temperature. Anything else is the bench (never a wrong instrument). A `store` into
    // the CO₂ incubator shares this staging but holds still: the flask is simply back on
    // its shelf. A compact progress-timer dial rides over the sample in every case.
    const inst = equipment
    const incubating = action === 'incubate_wait'
    // (the countdown progress dial is built generically for every station below and
    // driven by the real timer — no per-action ring here.)
    let seatFn = () => S.at(S[vessel], st.x, SEAT_Y, 0)
    let incDev = null
    let motionFn = null
    if (inst === 'plate_shaker') {
      const shaker = demo.buildPlateShaker()
      st.group.add(shaker); st.updatables.push(shaker)
      // rides the platform — a vessel as wide as the platform's corner clips (a 96-well plate)
      // rests ON them (0.76): at 0.62 the clips stood up through its base
      const onY = (C.footprint && C.footprint.maxX > 1.13) ? 0.76 : 0.62
      seatFn = () => S.at(S[vessel], st.x, onY, 0)
      // the orbit speeds up from rest and slows to rest (its angle eased; a linear one started at full speed)
      motionFn = (p) => { const a = demo.easeInOut(p) * 40; shaker.userData.setOrbit(a); S.at(S[vessel], st.x + Math.cos(a) * 0.06, onY, Math.sin(a) * 0.06) }
    } else if (inst === 'co2_incubator') {
      const inc = demo.buildCO2Incubator(); inc.position.set(0, 0, -1.1); incDev = inc
      st.group.add(inc); st.updatables.push(inc)
      seatFn = () => {   // flask on the lower shelf, inside — it comes in through the door, not the roof
        S.at(S[vessel], st.x, 0.66, -1.25); inc.userData.setDoor(true)   // open while it is carried in
        const v = S[vessel]; v.userData.enterVia = (v.userData.enterVia || new Vector3()).set(st.x, 0.66, 1.2)
      }
      // The DETACHMENT is the whole point of the step but it's small + behind glass.
      // As the step resolves: OPEN the door and PUSH the camera in close on the flask
      // (contract framing 'wide' → a low, close frame) so the detached cells read.
      if (incubating) {
        motionFn = (p) => { inc.userData.setDoor(!!S[vessel].userData.trip || p > 0.5) }   // open while it arrives, then as before
        st.pushCam = (p) => demo.easeInOut(demo.clamp((p - 0.35) / 0.4, 0, 1))
        st.pushTarget = C.framing === 'wide'
          ? { pos: [0, 1.2, 3.7], look: [0, 0.62, -1.25] }   // level, between the shelves, on the flask
          : { pos: [0, 1.4, 3.0], look: [0, 0.9, -1.0] }
      }
    } else if (inst === 'incubation_block') {
      const block = demo.buildColdBlock(); block.position.set(0, 0, 0) // centred UNDER the tube
      st.group.add(block); st.updatables.push(block)
      const wellY = block.userData.wellY ?? 0.2
      seatFn = () => S.at(S[vessel], st.x, wellY, 0) // the tube drops INTO the block's centre well
    }
    st.enter = () => { seat(0, SEAT_Y, 0); seatFn(); const v = S[vessel]; if (v.userData.setMono) v.userData.setMono(1) }
    st.timeline = (p) => {
      const v = S[vessel]
      // contentsState (passaging hero): during a flask incubation the adherent
      // MONOLAYER visibly DETACHES (trypsinisation) — confluent → cleared.
      if (incubating && v.userData.setMono) v.userData.setMono(1 - demo.easeInOut(demo.clamp((p - 0.3) / 0.5, 0, 1)))
      evolve(p, Math.sin(p * 10) * 0.02) // holds carried contents
      if (motionFn) motionFn(p)
      else if (incDev) incDev.userData.setDoor(!!S[vessel].userData.trip)   // a store: shut once it is in
    }
  } else if (action === 'heat' && equipment === 'water_bath') {
    // WATER BATH — a warm water-filled tub with the tube half-submerged + steam,
    // deliberately unlike the dry incubation block. Warm glow + bubbles ramp with p.
    const bath = demo.buildWaterBath()
    st.group.add(bath)
    st.updatables.push(bath)
    // a SMALL, TIGHT warm light — kept low-intensity + short-range so it doesn't
    // bloom onto the bench (art-direction: light stays near the vessel, not a flood).
    st.warm = new PointLight(0xffb060, 0, 1.8)
    st.warm.position.set(0, 0.7, 0.2)
    st.group.add(st.warm)
    const SURF = 0.66 // water-surface height (matches buildWaterBath SURFY)
    st.bubbles = streams.wrap('heatBubbles', () => Array.from({ length: 8 }, () => {
      const b = new Mesh(new SphereGeometry(0.045, 10, 8), new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0.1 }))
      b.userData.auditKind = 'effect'   // metadata for the dev collision audit: a bubble, not a solid
      b.userData.seed = { x: (Math.random() - 0.5) * 1.6, z: (Math.random() - 0.5) * 1.0, off: Math.random(), sp: 0.5 + Math.random() }
      st.group.add(b)
      return b
    }))()
    st.enter = () => {
      if (FLAT) { seat(0, 0, 1.6); bath.position.set(0, 0, -1.15) } // flat vessel in front, bath behind
      else { seat(0, 0.1, 0); bath.position.set(0, 0, 0) }          // tube dips INTO the water
    }
    st.timeline = (p) => {
      st.warm.intensity = p * 1.1 // gentle warmth near the vessel (no bench bloom)
      bath.userData.setWarmth?.(demo.clamp(p * 1.3, 0, 1))
      for (const b of st.bubbles) {
        const s = b.userData.seed
        const yy = (p * s.sp * 3 + s.off) % 1
        b.position.set(s.x, SURF + yy * 0.9, s.z)
        b.scale.setScalar(0.4 + yy)
        b.visible = !FLAT // bubbles only rise when a tube is dipped in
      }
      evolve(p, Math.sin(p * 12) * 0.02) // holds carried contents
    }
  } else if (action === 'cool_ice' || equipment === 'ice_bucket') {
    // ice bucket + a cold cast that deepens with p (frost creep) + a faint shiver.
    const ice = demo.buildIceBucket()
    ice.position.set(0, 0, 0.3)
    st.group.add(ice)
    st.updatables.push(ice)
    st.cold = new PointLight(0x5fb8f0, 0, 4)
    st.cold.position.set(0, 1, 0.7)
    st.group.add(st.cold)
    st.enter = () => seat(0, 0.34, 0.3)
    st.timeline = (p) => {
      evolve(p) // holds the carried contents
      st.cold.intensity = p * 2.6 // cold cast ramps up (monotonic)
      // faint cold shiver — its amplitude eases in (a sine from p 0 started at full speed)
      S[vessel].rotation.z = Math.sin(p * 30) * 0.02 * demo.easeInOut(demo.clamp(p / 0.1, 0, 1))
    }
  } else if (action === 'thermocycle') {
    // PCR: the sample sits in the thermocycler; the lid closes; it cycles hot↔cool
    // with a live CYCLE n/N counter driven by repeat.count.
    const tc = demo.buildThermocycler()
    st.group.add(tc)
    st.updatables.push(tc)
    st.dev = tc
    const n = cycles > 0 ? cycles : 30
    // Shrink the tube to a PCR-tube size and SINK it into a well so only its cap sits
    // near the block top (~0.83). The hinged lid then CLOSES over it during cycling —
    // its closed underside (~0.89) clears the cap, so it presses down without clipping.
    st.enter = () => {
      seat(0, 0.08, 0.0)
      S[vessel].scale.setScalar(0.44)
      tc.userData.setLid(true); tc.userData.setProgress(0, n)
    }
    st.timeline = (p) => {
      // lid CLOSED over the loaded tube while it cycles; it opens by p=0.78, and the
      // finished tube then lifts STRAIGHT UP out of its well (exitLiftPoint) — sunk in the
      // block it could not be seen, so the settled frame read as a closed black box
      tc.userData.setLid(!(p > 0.12 && p < 0.78))
      tc.userData.setProgress(p, n)
      const up = demo.easeInOut(demo.clamp((p - 0.82) / 0.12, 0, 1))
      const lift = exitLiftPoint({ x: 0, y: 0.08, z: 0 }, 1.0)
      S.at(S[vessel], st.x + lift.x, demo.lerp(0.08, lift.y, up), lift.z)
      evolve(p) // contents unchanged; the tube just cycles temperature
    }
  } else if (action === 'electrophorese' && container === 'gel') {
    // DOCK THE SAMPLE GEL IN THE TANK, run it, lift it out. The tank's lid (leads and all)
    // comes straight up off the tank; the gel lifts straight up off the bench to clear the
    // rim, glides over, and lowers into the running buffer; the lid goes back on and the
    // run shows (voltage on, the loaded band migrating). At the end the lid lifts again and
    // the gel rises STRAIGHT UP out of the tank (the exitLiftPoint pattern) — it never
    // passes through a wall or the lid. The rig's placeholder slab is hidden: one gel.
    const rig = demo.buildGelRig()
    st.group.add(rig)
    st.updatables.push(rig)
    st.dev = rig
    rig.userData.showGel(false)
    const BENCH = { x: -3.1, z: 0.3 }                 // clear of the tank's footprint (the gel's tray sits 0.8 off its origin: at −2.9 it stood 0.16 under the tank's edge)
    // seated ON the tank's floor (its tray hung 0.25 above it in the buffer, its top through the tank's rim)
    const DOCK = { x: 0, y: rig.userData.dockY - 0.25, z: 0 }
    const CLEAR = rig.userData.rimY + 0.4             // gel base clears the rim on the way in/out
    const put = (x, y, z) => S.at(S[vessel], st.x + x, y, z)
    st.enter = () => { seat(BENCH.x, SEAT_Y, BENCH.z); rig.userData.setLidLift(0); rig.userData.setVolts(false) }
    st.timeline = (p) => {
      const seg = (a, b) => demo.easeInOut(demo.clamp((p - a) / (b - a), 0, 1))
      if (p < 0.08) {                                  // 1 · lid (with leads) lifts straight up
        rig.userData.setLidLift(seg(0, 0.08)); put(BENCH.x, SEAT_Y, BENCH.z)
      } else if (p < 0.16) {                           // 2 · gel lifts straight up off the bench
        put(BENCH.x, demo.lerp(SEAT_Y, CLEAR, seg(0.08, 0.16)), BENCH.z)
      } else if (p < 0.26) {                           // 3 · glide over the tank, held clear
        const q = seg(0.16, 0.26); put(demo.lerp(BENCH.x, DOCK.x, q), CLEAR, demo.lerp(BENCH.z, DOCK.z, q))
      } else if (p < 0.34) {                           // 4 · lower into the buffer
        put(DOCK.x, demo.lerp(CLEAR, DOCK.y, seg(0.26, 0.34)), DOCK.z)
      } else if (p < 0.40) {                           // 5 · lid back on
        put(DOCK.x, DOCK.y, DOCK.z); rig.userData.setLidLift(1 - seg(0.34, 0.40))
      } else if (p < 0.82) {                           // 6 · the run: volts on, band migrates
        put(DOCK.x, DOCK.y, DOCK.z); rig.userData.setLidLift(0); rig.userData.setVolts(true)
      } else if (p < 0.88) {                           // 7 · volts off, lid off
        put(DOCK.x, DOCK.y, DOCK.z); rig.userData.setVolts(false); rig.userData.setLidLift(seg(0.82, 0.88))
      } else if (p < 0.93) {                           // 8 · exit: straight up out of the tank
        const lift = exitLiftPoint({ x: DOCK.x, y: DOCK.y, z: DOCK.z }, CLEAR)
        put(lift.x, demo.lerp(DOCK.y, lift.y, seg(0.88, 0.93)), lift.z); rig.userData.setLidLift(1)
      } else if (p < 0.97) {                           // 9 · back over its place on the bench, held clear
        const q = seg(0.93, 0.97); put(demo.lerp(DOCK.x, BENCH.x, q), CLEAR, demo.lerp(DOCK.z, BENCH.z, q)); rig.userData.setLidLift(1)
      } else {                                         // 10 · set down where it came from (it used to be
        put(BENCH.x, demo.lerp(CLEAR, SEAT_Y, seg(0.97, 1)), BENCH.z)   // left hanging over the tank); the lid
        rig.userData.setLidLift(1 - seg(0.97, 1))                         // (with its leads) goes back on
      }
      evolve(demo.clamp((p - 0.40) / 0.42, 0, 1))      // contents change only while running
    }
  } else if (action === 'electrophorese') {
    // electrophorese on anything but a gel (a membrane: the blot) is not a gel-tank run
    // (#5). No transfer apparatus is modelled, so the vessel rests on the bench and takes
    // on its result — never a wrong instrument.
    st.enter = () => seat(0, SEAT_Y, 0)
    st.timeline = (p) => { evolve(p) }
  } else if (action === 'store' && equipment === 'freezer') {
    // end-state storage: the vessel glides INTO the freezer; the door closes; frost breathes.
    const fr = demo.buildFreezer()
    fr.position.set(0.1, 0, -1.5)
    st.group.add(fr)
    st.updatables.push(fr)
    st.dev = fr
    st.cold = new PointLight(0x8fbaf0, 0, 4)
    st.cold.position.set(0, 1, -0.6)
    st.group.add(st.cold)
    // The cavity opening faces +z (spans y≈0.30–2.40). The vial must enter THROUGH
    // the opening — never through a wall. CRITICAL: it stays LOW (base y≈0.32, so even
    // the 1.7 sample tube tops out ~2.02, under the cavity top) the entire time it is at or
    // inside the freezer, and only hops UP while still out in front of the box (never
    // over it). Door opens first; closes only once the vial is fully inside.
    const bench = { x: -1.4, y: SEAT_Y, z: 0.9 }
    const front = { x: 0.1, y: 0.32, z: 0.4 }   // staged low, in front of the mouth
    const inside = { x: 0.1, y: 0.32, z: -1.0 } // seated on the cavity floor (y 0.30): a 1.7 tube tops out at 2.02, under the 2.40 cavity top
    const move = (v, a, b, q) => S.at(v, st.x + demo.lerp(a.x, b.x, q), demo.lerp(a.y, b.y, q), demo.lerp(a.z, b.z, q))
    st.enter = () => { seat(bench.x, bench.y, bench.z); fr.userData.setDoor(true); fr.userData.setFrost(0); st.cold.intensity = 0 }
    st.timeline = (p) => {
      evolve(p)
      const v = S[vessel]
      fr.userData.setDoor(p < 0.66)  // open until the vial is seated inside, then close
      if (p < 0.66) v.userData.exitOut = null
      if (p < 0.14) {                // 1 · door swings open; vial waits on the bench
        S.at(v, st.x + bench.x, bench.y, bench.z)
      } else if (p < 0.42) {         // 2 · approach the opening — hop stays OUT in front of the box
        const q = demo.easeInOut((p - 0.14) / 0.28)
        S.at(v, st.x + demo.lerp(bench.x, front.x, q), demo.lerp(bench.y, front.y, q) + Math.sin(q * Math.PI) * 0.45, demo.lerp(bench.z, front.z, q))
      } else if (p < 0.66) {         // 3 · move STRAIGHT IN through the opening (−z only, low)
        move(v, front, inside, demo.easeInOut((p - 0.42) / 0.24))
      } else {                       // 4 · inside, door closed — deep-cold cast + frost puff
        S.at(v, st.x + inside.x, inside.y, inside.z)
        // when it leaves, it comes back out through the opening before it rises
        v.userData.exitOut = (v.userData.exitOut || new Vector3()).set(st.x + front.x, front.y, front.z)
        st.cold.intensity = (p - 0.66) * 5
        fr.userData.setFrost(0.4 * Math.max(0, Math.sin((p - 0.66) * 7)))
      }
    }
  } else if (action === 'seed') {
    // dispense the sample into the culture vessel; on agar, a spreader then sweeps it out.
    demo.stationReagent(st, SEAT_Y, { key: 'r', blabel: '', color: endColor, vessel, vlabel: name || '', vsub: vol || '', cStart: startColor, cEnd: endColor, lStart: startLevel, lEnd: endLevel, dispense: C.dispense, entry: C.entryPoint })
    frameAngledPipette(st, C.dispense, 0)
    if (container === 'agar_plate') {
      const spr = demo.buildSpreader()
      spr.scale.setScalar(0.9)
      spr.visible = false
      st.group.add(spr)
      const base = st.timeline
      // dispense first (the whole pipette run, withdrawal included, in p 0-0.6), THEN
      // spread (0.62-1): the spreader never sweeps while the tip is still in the plate
      // it comes DOWN from above the frame onto the agar, sweeps (eased in and out), and goes
      // back up out of the frame — it used to pop in over the plate, start sweeping at full
      // speed, hover 0.05 above the agar and be left there
      const OUT = 12, ON = 0.151
      st.timeline = (p) => {
        base(demo.clamp(p / 0.6, 0, 1))
        spr.visible = p > 0.6 && p < 0.999
        const e = demo.easeInOut(demo.clamp((p - 0.7) / 0.25, 0, 1)), a = e * Math.PI * 3 // sweeping circles
        const y = p < 0.7 ? demo.lerp(OUT, ON, demo.easeInOut(demo.clamp((p - 0.6) / 0.1, 0, 1)))
          : p < 0.95 ? ON : demo.lerp(ON, OUT, demo.easeInOut((p - 0.95) / 0.05))
        spr.position.set(Math.cos(a) * 0.42, y, Math.sin(a) * 0.36)
        spr.rotation.y = a
      }
    }
  } else if (action === 'stain') {
    // flood a stain/dye over the sample surface — the slide rests in a staining tray.
    const tray = demo.buildStainingTray()
    st.group.add(tray)
    st.updatables.push(tray)
    st.enter = () => { seat(0, 0.28, 0); S.at(S[vessel], st.x, 0.28, 0) } // rest the slide ON the tray rails
    st.timeline = (p) => {
      const f = demo.easeInOut(demo.clamp((p - 0.15) / 0.6, 0, 1))
      S[vessel].userData.setLevel(demo.lerp(startLevel, Math.max(startLevel, endLevel, 0.7), f))
      if (p > 0.2) S[vessel].userData.setColor(endColor) // dye floods over
    }
  } else if (action === 'measure') {
    // EQUIPMENT CONTRACT: read each vessel on the instrument it actually goes in — a
    // 96-well plate on a PLATE READER, a tube on a NanoDrop, a culture flask under an
    // INVERTED MICROSCOPE, a slide under a LIGHT MICROSCOPE (100× oil), a gel on a UV
    // TRANSILLUMINATOR. The vessel rests on/in the instrument while it reads — no spin.
    // The instrument was resolved from the container AND the reading the step names
    // (resolveRecipe): "record the yield" or an unmodelled Bioanalyzer rests on the bench.
    const inst = equipment
    // rest the sample on an instrument's stage at its stated height (flat vessels are
    // otherwise pinned to the bench by seat()'s FLAT guard), reading progress ramping.
    // (dx, dz: where on the stage it rests, clear of the instrument's arm / lens; it leaves
    // forward off the stage, from under whatever is above it, before it rises)
    const onStage = (dev, sy, k = 1.3, dx = 0, dz = 0) => {
      st.dev = dev; st.group.add(dev); st.updatables.push(dev)
      const out = (v) => { v.userData.exitOut = (v.userData.exitOut || new Vector3()).set(st.x + dx, sy, dz + 1.4) }
      st.enter = () => { seat(0, 0, 0); S.at(S[vessel], st.x + dx, sy, dz); const v = S[vessel]; v.userData.enterVia = (v.userData.enterVia || new Vector3()).set(st.x + dx, sy, dz + 1.4); dev.userData.setProgress?.(0) }
      st.timeline = (p) => { evolve(p); S.at(S[vessel], st.x + dx, sy, dz); out(S[vessel]); dev.userData.setProgress?.(demo.easeInOut(demo.clamp(p * k, 0, 1))) }
    }
    if (inst === 'plate_reader') {
      const reader = demo.buildPlateReader()
      st.group.add(reader); st.updatables.push(reader); st.dev = reader
      st.enter = () => { seat(0, 0.53, 1.9); reader.userData.setDrawer(true); reader.userData.setOD(0) }
      st.timeline = (p) => {
        const e = demo.easeInOut(demo.clamp(p * 1.3, 0, 1))
        reader.userData.setDrawer(p < 0.35)                     // plate slides in, then reads
        S.at(S[vessel], st.x, 0.53, demo.lerp(1.9, 0.35, e))    // ride the drawer into the slot
        reader.userData.setOD(e * 1.85)
        evolve(p)
      }
    } else if (inst === 'nanodrop') {
      const nano = demo.buildNanoDrop()
      st.group.add(nano); st.updatables.push(nano); st.dev = nano
      st.enter = () => seat(-1.4, 0, 0.8)
      st.timeline = (p) => { evolve(p); nano.userData.setProgress?.(demo.easeInOut(demo.clamp(p * 1.4, 0, 1))) }
    } else if (inst === 'inverted_microscope') {
      const scope = demo.buildInvertedMicroscope()
      onStage(scope, scope.userData.stageY)
    } else if (inst === 'light_microscope') {
      const scope = demo.buildLightMicroscope()
      onStage(scope, scope.userData.stageY + 0.02, 1.3, 0, 0.58)   // in front of the arm and clear of the objective (its back edge ran 0.3 into the arm), on the stage clips
    } else if (inst === 'uv_transilluminator') {
      const tl = demo.buildUVTransilluminator()
      onStage(tl, tl.userData.stageY, 1.3, 0, 0.5)         // forward, clear of the camera housing behind the stage (it ran 2.7 mm into it)
    } else {
      // no instrument accepts this vessel: hold it AT REST with its readout. A
      // meaningless idle spin would imply a reading is happening when none is.
      st.enter = () => seat(0, SEAT_Y, 0)
      st.timeline = (p) => { evolve(p) }
    }
  } else {
    // generic actionable (rare): hold the vessel AT REST. A vessel spinning for no
    // reason implies work that isn't happening — stillness is honest.
    st.enter = () => seat(0, SEAT_Y, 0)
    st.timeline = (p) => { evolve(p) }
  }

  // Bug #2: if the sample's CONTAINER changed from the previous station, ANIMATE the
  // hand-off (old vessel lifts out → new vessel settles in) instead of the new vessel
  // popping out of nowhere. Skip actions that already choreograph the vessel: transfer
  // pours across; the centrifuge glides it into the rotor; store flies it into the freezer.
  const prevVessel = prevContainer ? containerContract(prevContainer).vessel : null
  // `transfer` is now handled BY the hand-off wrapper (it IS an A→B move). Only the
  // actions that run their own vessel choreography stay excluded.
  const custom = (action === 'store' && equipment === 'freezer') || equipment === 'centrifuge'
  if (prevVessel && prevVessel !== vessel && !custom && !st._skipHandoff) {
    wrapHandoff(st, S, prevVessel, vessel, startColor, startLevel, containerContract(prevContainer).seat.y - C.seat.y,
      Lq ? { from: ulAt(prevVessel, 'start'), fromColor: colAt(prevVessel, 'start', startColor), to: startUl, toColor: startColor } : null)
  }
  hideLabels(st.group)
}

// A NEST move (Stage-18): "transfer the column to a clean tube". You pick up the spin
// COLUMN and drop it INTO a fresh collection tube — the vessel travels, the liquid does
// NOT (it stays in the column's bed). So: both vessels on the bench, the clean tube EMPTY
// and never filling, NO pipette rig, and the column lifts → travels over → lowers into the
// tube's mouth (the destination's drop-in approach). At p=1 the column sits in the tube.
function configureNestMove(st, S, o) {
  const { columnKey, tubeKey, columnSeatY, tubeSeatY, color, level, vols } = o
  // VOLUMES: the column keeps what it holds; the clean tube holds what the ledger says (nothing);
  // the used collection tube left on the bench keeps its flow-through
  const colAmt = (col) => { if (vols) { col.userData.setVolume?.(vols.column); col.userData.setColor?.(vols.columnColor) } else col.userData.setLevel?.(level) }
  const tubeAmt = (tube) => { if (vols && tube.userData.setVolume) tube.userData.setVolume(vols.tube); else tube.userData.setLevel?.(0) }
  const AX = -0.85, BX = 0.7, Z = 0        // column starts left, the clean tube waits right
  const LIFT = 1.9                          // how high the column rises to clear the rims
  const NEST_Y = tubeSeatY + 0.381          // seated depth: dropped into the tube's mouth, resting on it (0.42 left it 0.04 above)
  const NEST_SCALE = 0.84                   // slims the column so it sits INSIDE the tube, not around it
  // frame both vessels (base → top), never the (absent) pipette rig
  st.frameAnchors = [
    new Vector3(AX, columnSeatY, Z), new Vector3(AX, columnSeatY + 1.7, Z),
    new Vector3(BX, tubeSeatY, Z), new Vector3(BX, tubeSeatY + 1.8, Z),
  ]

  st.enter = () => {
    S.only(tubeKey)
    S[columnKey].userData.reattachCollection?.()   // arrives as the full assembly
    const col = S[columnKey], tube = S[tubeKey]
    col.visible = true; tube.visible = true
    col.rotation.set(0, 0, 0); tube.rotation.set(0, 0, 0)
    col.scale.setScalar(1)
    col.userData.setColor?.(color); colAmt(col)                    // column keeps its bed contents
    tubeAmt(tube)                                                  // fresh clean tube — empty
    if (vols && col.userData.setFlow) { col.userData.setFlow(vols.flow); col.userData.setFlowColor(vols.flowColor) }
    S.snapTo(col, st.x + AX, columnSeatY, Z)
    S.snapTo(tube, st.x + BX, tubeSeatY, Z)
  }

  st.timeline = (p) => {
    const col = S[columnKey], tube = S[tubeKey]
    col.visible = true; tube.visible = true
    tubeAmt(tube)                            // the clean tube NEVER fills — no liquid moves
    S.snapTo(tube, st.x + BX, tubeSeatY, Z)
    // the COLUMN moves, its used collection tube does not: from the first lift the
    // collection tube stays standing on the bench where the assembly was
    if (p > 0.001) col.userData.detachCollection?.(st.group)
    else col.userData.reattachCollection?.()
    let x, y, sc = 1
    if (p < 0.34) {                          // 1 · lift the column straight up off the bench
      x = AX; y = demo.lerp(columnSeatY, columnSeatY + LIFT, demo.easeInOut(p / 0.34))
    } else if (p < 0.66) {                   // 2 · carry it across, held high, over the clean tube
      x = demo.lerp(AX, BX, demo.easeInOut((p - 0.34) / 0.32)); y = columnSeatY + LIFT
    } else {                                 // 3 · lower it DOWN INTO the tube's mouth (drop-in)
      const e = demo.easeInOut((p - 0.66) / 0.34)
      x = BX; y = demo.lerp(columnSeatY + LIFT, NEST_Y, e); sc = demo.lerp(1, NEST_SCALE, e)
    }
    col.scale.setScalar(sc)
    colAmt(col)                              // contents unchanged the whole way
    S.snapTo(col, st.x + x, y, Z)
  }
}

// Wrap a station's enter/timeline with a visible container hand-off: for the first
// TR of the step the OLD vessel lifts up and out (remove motion) and the NEW vessel
// descends into its seat (insert motion) — the two halves of one transition. Then the
// station's real action runs on the remapped remainder. Uses snapTo (position == tPos)
// so the swap is crisp and the frame-loop glide never fights it.
// fromDy: the OLD vessel's own seat height relative to the new one's (a gel sits at 0, a membrane
// at −0.025: the gel used to be lowered to the membrane's seat, into the bench)
function wrapHandoff(st, S, fromKey, toKey, color, level, fromDy = 0, vols = null) {
  // VOLUMES: each vessel carries its OWN contents (the old one what it holds, the new one what it
  // starts with) — the incoming vessel used to arrive already holding the old one's level
  const oldAmt = (ov) => { if (vols && ov.userData.setVolume) { ov.userData.setVolume(vols.from); ov.userData.setColor?.(vols.fromColor) } else { ov.userData.setColor?.(color); ov.userData.setLevel?.(level) } }
  const newAmt = (nv) => { if (vols && nv.userData.setVolume) { nv.userData.setVolume(vols.to); nv.userData.setColor?.(vols.toColor) } else { nv.userData.setColor?.(color); nv.userData.setLevel?.(level) } }
  const baseEnter = st.enter
  const baseTimeline = st.timeline
  const TR = 0.26   // fraction of the step spent on the hand-off
  // NOTHING POPS IN VIEW: the old vessel rises straight up and on out of the top of the frame;
  // the new one comes down from above the frame straight onto the seat (they used to swap in
  // place at the top of a short lift — one vanishing, the other appearing). Straight up and
  // down: nothing stands over a seat
  const OUT = 12.0
  st.enter = () => {
    baseEnter && baseEnter()             // seats the NEW vessel at its target + sets its state
    const nv = S[toKey]
    st._seat = nv.userData.tPos.clone()  // where the new vessel belongs
    const ov = S[fromKey]
    ov.visible = true                    // the OLD vessel carries the incoming contents in
    ov.rotation.set(0, 0, 0)
    oldAmt(ov)
    S.snapTo(ov, st._seat.x, st._seat.y + fromDy, st._seat.z)
    nv.visible = false                   // hide the new one until it descends
    st._handoff = true
  }
  st.timeline = (p) => {
    if (p < TR) {
      const q = p / TR
      const ov = S[fromKey]
      const nv = S[toKey]
      if (q < 0.5) {                     // old vessel rises straight up, out of the frame (remove)
        ov.visible = true; nv.visible = false
        const up = demo.easeInOut(q / 0.5)
        S.snapTo(ov, st._seat.x, st._seat.y + fromDy + up * OUT, st._seat.z)
      } else {                           // new vessel comes straight down from above the frame (insert)
        ov.visible = false; nv.visible = true
        const down = demo.easeInOut((q - 0.5) / 0.5)
        newAmt(nv)
        S.snapTo(nv, st._seat.x, st._seat.y + (1 - down) * OUT, st._seat.z)
      }
    } else {
      if (st._handoff) {                 // hand-off done — lock to the new vessel, run the action
        S.only(toKey)
        S.snapTo(S[toKey], st._seat.x, st._seat.y, st._seat.z)
        S[fromKey].rotation.set(0, 0, 0)
        st._handoff = false
      }
      baseTimeline && baseTimeline((p - TR) / (1 - TR))
    }
  }
}

// A CONTENTS MOVE (Stage-13): a transfer where the source does NOT nest into the
// destination. The sample's LIQUID is moved A→B with a PIPETTE — aspirate from the
// source, cruise, dispense into the destination — exactly the rig `stationReagent`
// uses, only the source is the sample's OLD vessel instead of a reagent bottle. Both
// vessels rest on the bench side by side. There is NO stream bridging them (that reads
// as a wire) and nothing pours through open air: while the liquid is in transit it
// lives INSIDE the tip. The source drains as the tip draws up; the destination fills
// only once the tip is dispensing (the same dispense window as a reagent add); the colour
// travels with it. We reveal both vessels, then lock to the destination.
function configurePipetteTransfer(st, S, o) {
  const { fromKey, toKey, srcSeatY, dstSeatY, srcDisp, dstDisp, dstEntry, color, startLevel, endLevel, name, vol, move, vols } = o
  // VOLUMES: the stated move in passes of one tip — the source drops as each tip draws, the
  // destination rises as it dispenses (a mL move is one pass: no serological pipette is modelled)
  const P = move ? move.passes || 1 : 0, each = move ? move.ul / P : 0
  if (move) st.passes = P
  // spaced by each vessel's FOOTPRINT (a flask is 3 units long with its neck), never by
  // tube-sized constants — a microtube beside a flask used to stand inside its neck
  const { AX, BX, srcFoot, dstFoot } = sideBySide(o.srcToken, o.dstToken)
  const Z = 0.1
  // aspirate over the SOURCE (tip dips in from srcSeatY, then rises) and dispense at the
  // DESTINATION's contract mouth (straight into a tube; angled down a flask's neck).
  const dstAngled = dstDisp && dstDisp.approach === 'angled'
  const from = { x: AX + (srcDisp?.x || 0), y: srcSeatY, z: Z + (srcDisp?.z || 0) }
  const to = { x: BX + (dstDisp?.x || 0), y: dstAngled && dstDisp.y != null ? dstDisp.y : dstSeatY, z: Z + (dstDisp?.z || 0) }
  // frame BOTH vessels (base → top of each) so the fit keeps them centred, not the tall
  // pipette (which is excluded from the frame).
  st.frameAnchors = [
    new Vector3(AX + srcFoot.minX, srcSeatY, Z), new Vector3(AX + srcFoot.maxX, srcSeatY + 1.7, Z),
    new Vector3(BX + dstFoot.minX, dstSeatY, Z), new Vector3(BX + dstFoot.maxX, dstSeatY + 1.7, Z),
  ]

  demo.addPipetteRig(st)
  if (dstAngled) frameAngledPipette(st, dstDisp, BX, Z)

  st.enter = () => {
    S.only(toKey)
    const a = S[fromKey], b = S[toKey]
    a.visible = true; b.visible = true
    a.rotation.set(0, 0, 0); b.rotation.set(0, 0, 0)
    if (name) a.userData.setLabel?.(name, vol || '')
    if (vols) {
      a.userData.setColor?.(vols.aColor); if (a.userData.setVolume) a.userData.setVolume(vols.a); else a.userData.setLevel?.(startLevel)
      if (vols.bColor != null) b.userData.setColor?.(vols.bColor); if (b.userData.setVolume) b.userData.setVolume(vols.b); else b.userData.setLevel?.(0.03)
    } else {
      a.userData.setColor?.(color); a.userData.setLevel?.(startLevel)
      b.userData.setColor?.(color); b.userData.setLevel?.(0.03)
    }
    S.snapTo(a, st.x + AX, srcSeatY, Z)
    S.snapTo(b, st.x + BX, dstSeatY, Z)
    demo.pipRest(st)
  }

  st.timeline = (p) => {
    const a = S[fromKey], b = S[toKey]
    a.visible = true; b.visible = true
    S.snapTo(a, st.x + AX, srcSeatY, Z)
    S.snapTo(b, st.x + BX, dstSeatY, Z)
    // the resident pipette runs aspirate → cruise-high → dispense, source mouth to dest.
    // dipDepth = the DEST container's entryPoint, so the tip stops above a spin column's
    // frit instead of plunging through it.
    // a capped vessel (cryovial, flask) opens before the tip reaches it and closes after —
    // a tip through a closed cap is a lie (the source while it is drawn from, the
    // destination while it is dispensed into)
    if (move && vols) {
      const { j, lp } = passAt(p, P)
      S[fromKey].userData.setCap?.(!(lp > 0.01 && lp < 0.32))
      S[toKey].userData.setCap?.(!(p > 0.4 / P && p < 1 - 0.03 / P))
      demo.pipetteRun(st, from, to, lp, { color: move.color, tipUl: Math.min(each, TIP_UL), approach: dstDisp?.approach, tilt: dstDisp?.tilt, depth: dstDisp?.depth, dipDepth: dstEntry })
      const drawn = (j + demo.drawProgress(lp)) * each, given = (j + demo.dispenseProgress(lp)) * each
      if (a.userData.setVolume) a.userData.setVolume(vols.a - drawn); else a.userData.setLevel?.(demo.lerp(startLevel, 0.03, drawn / move.ul))
      if (b.userData.setVolume) { b.userData.setVolume(vols.b + given); b.userData.setColor?.(mixColor(vols.bColor, vols.b, move.color, given)) }
      else if (given > 0) { b.userData.setColor?.(color); b.userData.setLevel?.(demo.lerp(0.03, endLevel, given / move.ul)) }
      if (p > 0.98) S.snapTo(b, st.x + BX, dstSeatY, Z)
      return
    }
    S[fromKey].userData.setCap?.(!(p > 0.01 && p < 0.32))
    S[toKey].userData.setCap?.(!(p > 0.4 && p < 0.97))
    demo.pipetteRun(st, from, to, p, { color, fill: 0.8, approach: dstDisp?.approach, tilt: dstDisp?.tilt, depth: dstDisp?.depth, dipDepth: dstEntry })
    // SOURCE drains while the tip aspirates (pipetteRun's draw phase ends at p≈0.26).
    a.userData.setLevel?.(demo.lerp(startLevel, 0.03, demo.easeInOut(demo.clamp(p / 0.26, 0, 1))))
    // DEST fills only once the tip is dispensing — only inside the dispense window (no early fill).
    if (p > 0.68) {
      const q = demo.dispenseProgress(p)
      b.userData.setColor?.(color)
      b.userData.setLevel?.(demo.lerp(0.03, endLevel, q))
    }
    // the emptied source STAYS where it stands to the end of the step (it used to vanish at
    // p 0.98, in full view); the next step's entry puts it away as the camera leaves
    if (p > 0.98) S.snapTo(b, st.x + BX, dstSeatY, Z)
  }
}

// THE STAND CLEARS THE SEAT: where a vessel this station sets down overlaps the pipette stand's
// base (a 96-well plate, a flask — or a sample parked beside a prep), the stand moves left just
// far enough (it stood with its foot under the plate). Nowhere else does it move. Measured from
// where the station's own enter() seats its vessels (their state is restored after); the stand
// is excluded from the framing.
const STAND_R = 0.72
function clearStand(st) {
  const stand = st.group.children.find((c) => c.userData && c.userData.builder === 'buildPipetteStand')
  const S = demo.getSample()
  if (!stand || !S || !st.enter || !st.pip) return   // pipetting stations only (a dressing stand is never moved)
  const vessels = [...S.vessels, ...demo.getPreps()]
  const saved = vessels.map((v) => ({ v, parent: v.parent, docked: v.userData.docked, trip: v.userData.trip, p: v.position.clone(), t: v.userData.tPos ? v.userData.tPos.clone() : null, vis: v.visible, r: v.rotation.clone(), s: v.scale.clone() }))
  const snap = demo.getSnap ? demo.getSnap() : false
  const pipPos = st.pip.position.clone(), pipRot = st.pip.rotation.clone()   // enter() puts it at its home: restore the build pose
  let boxes = []
  try {
    demo.setSnap(true)
    st.enter()
    // where the station seats its vessels: the shown ones, and one it seats but shows only later
    // (a hand-off's incoming vessel) — by its target, if that is on this station
    for (const v of vessels) {
      const t = v.userData.tPos
      if (!v.visible && !(t && Math.abs(t.x - st.x) < SPACING / 2)) continue
      if (t) v.position.copy(t)                                  // where it is going to rest
      v.updateMatrixWorld(true)
      const b = new Box3()
      v.traverse((o) => { if (o.isMesh && !o.isSprite && o.geometry) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)) } })
      if (!b.isEmpty() && b.min.y < 0.2) boxes.push(b.translate(new Vector3(-st.x, 0, 0)))   // standing on the bench
    }
  } finally {
    for (const o of saved) {
      if (o.v.parent !== o.parent && o.parent) o.parent.add(o.v)          // a station that docked it (a rotor slot)
      o.v.userData.docked = o.docked; o.v.userData.trip = o.trip
      o.v.position.copy(o.p); if (o.t) o.v.userData.tPos.copy(o.t); o.v.visible = o.vis; o.v.rotation.copy(o.r); o.v.scale.copy(o.s)
    }
    demo.setSnap(snap)
    st.pip.position.copy(pipPos); st.pip.rotation.copy(pipRot); st.pip.userData.setFluid?.(0)
  }
  const cz = stand.position.z
  let x = stand.position.x
  for (const b of boxes) {
    const nz = Math.max(b.min.z, Math.min(cz, b.max.z)), dz = Math.abs(cz - nz)
    if (dz >= STAND_R + 0.02) continue
    const nx = Math.max(b.min.x, Math.min(x, b.max.x))
    if (Math.hypot(x - nx, dz) >= STAND_R + 0.02) continue
    x = Math.min(x, b.min.x - Math.sqrt((STAND_R + 0.02) ** 2 - dz * dz))
  }
  stand.position.x = x
}

function useContainers(steps) {
  return useMemo(() => sampleContainerSequence(steps), [steps])
}

// Per-step build + display params for one station in the line.
function stationParams(baseStep, lang, altIdx, chain, producedInRun, container) {
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
  return { action: step.action, equipment, colorHex, vol, title, sub, seconds: step.duration_seconds, start, end, cycles, reagents,
           target: step.target || 'sample', produces: step.produces || null, drawsFrom,
           text: step.text_en || step.text || '' }
}

// TRAVEL — how a vessel (the sample, a prep) moves to its target each frame. A target that
// moves a little every frame (a timeline carrying the vessel) is FOLLOWED exactly. A target that JUMPS — the next station's seat, a new seat
// mid-step, an exit-lift waypoint — is TRAVELLED to on a critically damped spring: the vessel
// accelerates from rest and settles, never leaving at full speed, never overshooting.
// OMEGA 5/s: first-frame speed ≈ 23 % of the move's peak; 95 % of the way in ≈ 0.95 s.
const TRAVEL_JUMP = 0.12   // a target that moves farther than this in one frame jumped
const TRAVEL_OMEGA = 5
function travel(v, goal, dt) {
  const u = v.userData
  if (!u._goal) { u._goal = goal.clone(); u._vel = new Vector3(); u._spring = false }
  if (u._goal.distanceToSquared(goal) > TRAVEL_JUMP * TRAVEL_JUMP) {
    // the target jumped: travel to it — unless the vessel was SNAPPED onto it (a jump between
    // stations places it), which carries no motion
    if (v.position.distanceToSquared(goal) < 1e-10) { u._vel.set(0, 0, 0); u._spring = false } else u._spring = true
  }
  u._goal.copy(goal)
  if (u._spring) {
    const k = TRAVEL_OMEGA * TRAVEL_OMEGA, c = 2 * TRAVEL_OMEGA
    u._vel.x += (k * (goal.x - v.position.x) - c * u._vel.x) * dt
    u._vel.y += (k * (goal.y - v.position.y) - c * u._vel.y) * dt
    u._vel.z += (k * (goal.z - v.position.z) - c * u._vel.z) * dt
    v.position.addScaledVector(u._vel, dt)
    if (v.position.distanceToSquared(goal) < 1e-8 && u._vel.lengthSq() < 1e-6) { v.position.copy(goal); u._vel.set(0, 0, 0); u._spring = false }
  } else {
    // a target that moves a little every frame IS the choreography (the station's timeline eases
    // it): follow it exactly — the demo's exponential chase lagged behind it and cut its corners
    // diagonally through rims, lids and walls
    const before = _travelPrev.copy(v.position)
    v.position.copy(goal)
    if (dt > 0) u._vel.copy(v.position).sub(before).divideScalar(dt)   // carried into a spring if the target jumps
  }
}
const _travelPrev = new Vector3()
// is any shown vessel (the sample, a prep) still on its trip here?
function vesselsArriving() {
  const S = demo.getSample()
  if (S && S.vessels.some((v) => v.visible && v.userData.trip)) return true
  return demo.getPreps().some((v) => v.visible && v.userData.trip)
}
// A TRIP (demo.depart): from where the vessel stood, straight up to the clearance height, over
// to above its seat, straight down onto it — corners rounded, the whole path ONE smootherstep
// in time (it starts from rest and settles; 0.6–1.1 s by length). The seat is read live, so a
// station that moves the seat during the trip is followed.
const _tp = [new Vector3(), new Vector3(), new Vector3(), new Vector3()]
const _qId = new Quaternion()
function tripPoint(pts, s, out) {
  // the polyline with each inner corner replaced by a quadratic curve through it
  const R = 0.35
  const seq = []
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 || i === pts.length - 1) { seq.push(['p', pts[i]]); continue }
    const a = pts[i - 1], c = pts[i], b = pts[i + 1]
    const ra = Math.min(R, a.distanceTo(c) / 2), rb = Math.min(R, c.distanceTo(b) / 2)
    const p0 = c.clone().addScaledVector(a.clone().sub(c).normalize(), ra), p2 = c.clone().addScaledVector(b.clone().sub(c).normalize(), rb)
    seq.push(['q', p0, c, p2])
  }
  // sample to a dense polyline, then walk s of its length
  const poly = []
  for (const e of seq) {
    if (e[0] === 'p') poly.push(e[1].clone())
    else for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t; poly.push(new Vector3().addScaledVector(e[1], u * u).addScaledVector(e[2], 2 * u * t).addScaledVector(e[3], t * t)) }
  }
  let L = 0; const seg = []
  for (let i = 1; i < poly.length; i++) { const d = poly[i].distanceTo(poly[i - 1]); seg.push(d); L += d }
  let r = s * L
  for (let i = 0; i < seg.length; i++) { if (r <= seg[i] || i === seg.length - 1) return out.copy(poly[i]).lerp(poly[i + 1], seg[i] > 0 ? Math.min(1, r / seg[i]) : 1), L; r -= seg[i] }
  return out.copy(poly[poly.length - 1])
}
const smoother = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10) }
function travelTrip(v, dt) {
  const u = v.userData, tr = u.trip
  if (!tr) return false
  const seat = u.tPos
  // a seat under an overhead instrument (a camera, an objective) or inside one (an incubator)
  // is entered from the FRONT: over the front at the clearance height, down there, then in
  const via = u.enterVia
  if (via) { _tp[2].set(via.x, Math.max(via.y, tr.lift.y), via.z); _tp[3].copy(via) } else _tp[2].set(seat.x, Math.max(seat.y, tr.lift.y), seat.z)
  const tail = via ? [_tp[2], _tp[3], seat] : [_tp[2], seat]
  const pts = tr.out ? [tr.from, tr.out, tr.lift, ...tail] : [tr.from, tr.lift, ...tail]
  if (tr.D == null) {
    let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1])
    tr.L0 = tr.out ? tr.from.distanceTo(tr.out) / L : 0
    tr.D = Math.min(1.1, Math.max(0.6, 0.4 + L * 0.05)) + (tr.out ? 0.3 : 0)
  }
  tr.t += dt
  const s = smoother(tr.t / tr.D)
  tripPoint(pts, s, v.position)
  // leaving a tilted / scaled seat: upright and full size by the end of the first leg
  if (tr.out) { const k = smoother(tr.L0 > 0 ? s / tr.L0 : 1); v.quaternion.copy(tr.q0).slerp(_qId, k); v.scale.setScalar(tr.s0 + (1 - tr.s0) * k) }
  if (tr.t >= tr.D) {
    v.position.copy(seat); u.trip = null; u.enterVia = null
    if (tr.out) { v.quaternion.identity(); v.scale.setScalar(1) }
    if (u._goal) { u._goal.copy(seat); u._vel.set(0, 0, 0); u._spring = false }
  }
  return true
}

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
  const stateChain = useMemo(() => {
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
  }, [steps, lang, altByStep])

  // THE LIQUID LEDGER: every vessel's volume at the start and end of every station (liquidLedger.js)
  const ledger = useMemo(() => buildLedger(steps, { containers, altByStep, colorOf: (n) => new Color(reagentColor(n)).getHex() }), [steps, containers, altByStep])

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
    // a tube the text sizes ("a 15 mL conical tube") is that tube's nominal capacity
    demo.getSample().tube.userData.setCapacity?.(ledger.capacity.tube)
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
    const producedInRun = new Set(
      steps.filter((s) => s.action === 'prepare' && s.produces).map((s) => s.produces),
    )
    const stations = []
    steps.forEach((baseStep, i) => {
      const altIdx = altByStep[baseStep.index] || 0
      const container = containers[i] || 'microtube'
      const prevContainer = i > 0 ? (containers[i - 1] || 'microtube') : null
      const o = stationParams(baseStep, lang, altIdx, stateChain[i], producedInRun, container)
      const st = { group: new Group(), updatables: [], reagents: {}, pip: null, enter: null, timeline: null, x: i * SPACING, cen: null, dev: null, vis: 0, _vstate: -1 }
      configureStation(st, {
        action: o.action, equipment: o.equipment, container, prevContainer, color: o.colorHex, name: o.title, vol: o.vol, seconds: o.seconds,
        startColor: o.start.color, startLevel: o.start.level, endColor: o.end.color, endLevel: o.end.level, cycles: o.cycles, reagents: o.reagents,
        drawsFrom: o.drawsFrom, produces: o.produces, text: o.text,
        liq: ledger.stations[i],
      })
      // MEASURE the framing from the equipment now — group is still at the origin and
      // carries only the instrument (not the label/decal added below), so this is the
      // station's true content extent in local coords.
      st.frame = computeStationFrame(st)
      st.group.position.set(st.x, 0, 0)
      clearStand(st)
      // the title sits just ABOVE the thing the step is about — the props' bbox top,
      // centred on it — not over the station origin. Its own half-height (worldH/2)
      // plus a small gap put the plate's BOTTOM edge clear of the subject.
      // chromeless (the Home hero): just the lit glass, no title plate, no bench number.
      // A `prepare` station's subject is the CARRIED prep tube, which owns its own label and
      // travels with it — a station title here would duplicate it (and be left behind), so skip.
      if (!chromeless && !st.prepId) {
        const label = demo.makeLabel(o.title, o.sub)
        const LABEL_GAP = 0.95
        const halfH = (label.userData.worldH || 0.5) / 2
        label.position.set(st.frame.center.x, st.frame.top + LABEL_GAP + halfH, st.frame.center.z)
        st.group.add(label)
        st.label = label; st.labelBaseY = label.position.y; st.labelHalfH = halfH
      }
      scene.add(st.group)
      // the bench station number in front
      if (!chromeless) {
        const decal = demo.stationDecal(i + 1)
        decal.position.set(st.x, 0.02, 2.4)
        scene.add(decal)
        st.decal = decal
      }
      // BENCH-FALLBACK STAGING: a step that rests on the bare bench (no modelled instrument)
      // shows only what it states — a bench tag for a stated temperature / room temperature,
      // and (below) the countdown dial at rest when it is timed.
      const staging = BENCH_REST_ACTIONS.has(o.action)
        ? benchStaging(effectiveStep(baseStep, altIdx), o.equipment) : null
      if (staging && staging.tag && !chromeless) {
        const tag = makeBenchTag(staging.tag)
        tag.position.set(st.x + 0.9 + tag.userData.width / 2, 0.021, 2.4)   // just right of the number
        scene.add(tag)
        st.benchTag = tag
      }
      st.restDial = !!(staging && staging.dial)
      collectStationMats(st) // snapshot opacities so the unit fades as one
      // the countdown DIAL — a flat ring around the subject's base, radius MEASURED from
      // the frame footprint. Built for every station but shown only when a live timer is
      // engaged (driven in the frame loop). Added AFTER collectStationMats so the vis-fade
      // never clobbers the opacity the timer driver sets (paused-dim / done-fade).
      // the sample vessel is not a station prop, so size the ring to take in ITS footprint
      // too (a 1.9-wide agar plate hid a tube-sized ring completely)
      const vf = containerContract(container).footprint || { minX: -0.4, maxX: 0.4 }
      const vesselR = Math.max(Math.abs(vf.minX), Math.abs(vf.maxX))
      const dial = makeBenchDial(Math.max(st.frame.footprint.r, vesselR) + DIAL_MARGIN)
      dial.position.set(st.frame.footprint.cx, DIAL_Y, st.frame.footprint.cz)
      st.group.add(dial)
      st.dial = dial
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
  }, [scene, stateChain, containers, ledger])

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
  // DEV: the collision / motion audit (scripts/collision-audit.mjs, src/dev/collisionDriver.js)
  // holds this loop and steps the SAME frame function itself with the step's progress forced
  // (benchLine.pForce) — window.__benchLine exists only in a dev build
  const benchLine = useRef({ hold: false, pForce: null }).current
  const lastStateRef = useRef(null)
  const frame = (state, dt) => {
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
    const f = actCam && actCam.frame ? actCam.frame : DEFAULT_FRAME
    const fit = demo.clamp(f.radius / R_REF, 1, 1.7) // back off only for oversized rigs
    const cam = perspRef.current
    if (cam) {
      const cx = railX + f.center.x + Math.sin(time * 0.15) * 0.12
      // demo angle/height, scaled to fit, aimed at the content centre (x/y/z)
      let px = cx, py = f.center.y + (RAIL_Y - LOOK_Y) * fit, pz = f.center.z + RAIL_Z * fit
      let lx = cx, ly = f.center.y, lz = f.center.z
      // per-station camera PUSH (e.g. push in through the incubator glass onto the
      // flask so the monolayer detachment reads). Blends in with the step's progress.
      const push = actCam && actCam.pushCam ? actCam.pushCam(pRef.current) : 0
      if (push > 0 && actCam.pushTarget) {
        const t = actCam.pushTarget
        px = demo.lerp(px, railX + t.pos[0], push); py = demo.lerp(py, t.pos[1], push); pz = demo.lerp(pz, t.pos[2], push)
        lx = demo.lerp(lx, railX + t.look[0], push); ly = demo.lerp(ly, t.look[1], push); lz = demo.lerp(lz, t.look[2], push)
      }
      cam.position.set(px, py, pz)
      cam.lookAt(lx, ly, lz)
      // keep the active station's title label INSIDE the frame, below the top HUD band:
      // if its top edge would project above LABEL_TOP_NDC, lower it (never below the
      // subject's top) — a pushed-in or widened frame used to clip it at the top edge
      if (actCam && actCam.label) clampLabel(actCam, cam)
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
      if (tm.hasTimer) pRef.current = tm.progress // countdown drives every timed instrument
      // the step's action begins once its vessels have ARRIVED (a trip from the last station takes
      // up to ~1.1 s): the pipette used to dive into a tube still in the air
      else if (!vesselsArriving()) pRef.current = Math.min(pRef.current + dt / (act.duration || STEP_DUR), 1)   // a multi-pass or long pour takes longer
      if (benchLine.pForce != null) pRef.current = benchLine.pForce   // DEV: the audit drives p
      // the centrifuge needs absolute-time dock/lift choreography (a 10-min spin can't
      // glide in for two minutes), so it reads the timer directly; everything else is
      // continuous in p and tracks the countdown just by being fed the elapsed fraction.
      if (act.driveTimed && tm.hasTimer && benchLine.pForce == null) act.driveTimed(tm, dt)
      else act.timeline?.(pRef.current)
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

    // 4b · the countdown DIAL reads the SAME clock as the digits (timerRef.progress ==
    // elapsedFraction), NOT the choreography p. Shown only on the active station and only
    // while a timer is engaged (running, paused mid-way, or just completed). Paused dims
    // vs running; on completion it holds full, then fades out so it isn't left as furniture.
    {
      const t = timerRef.current
      for (const st of stations) {
        const dial = st.dial
        if (!dial) continue
        const isActive = st === act
        const engaged = isActive && t.hasTimer && (t.running || t.done || t.progress > 0.001)
        if (!engaged) {
          // a timed bench-fallback step shows its dial at rest (empty track) — the one cue
          // on a bare bench that the step is a timed wait
          if (isActive && st.restDial) { dial.visible = true; dial.userData.setFraction(0); dial.userData.fillMat.opacity = 1; dial.userData.trackMat.opacity = 0.9; st._dialFade = 1; continue }
          if (dial.visible) dial.visible = false; st._dialFade = 1; continue
        }
        dial.visible = true
        dial.userData.setFraction(t.progress)
        if (t.done) { // hold full, then fade the whole dial away
          st._dialFade = Math.max(0, (st._dialFade == null ? 1 : st._dialFade) - dt / 1.3)
          dial.userData.fillMat.opacity = st._dialFade
          dial.userData.trackMat.opacity = st._dialFade * 0.9
          if (st._dialFade <= 0.002) dial.visible = false
        } else { // running is bright; paused is visibly dimmer (a frozen ring must look frozen)
          st._dialFade = 1
          const paused = !t.running
          dial.userData.fillMat.opacity = paused ? 0.45 : 1
          dial.userData.trackMat.opacity = paused ? 0.6 : 0.9
        }
      }
    }

    // 5 · the ONE sample eases toward its world target — glides station→station.
    // While docked in a centrifuge rotor slot the rotor owns its transform, so skip
    // the glide (but still tick its liquid). Leaving a dock, an `exitLift` waypoint pulls
    // it STRAIGHT UP clear of the instrument first; once reached it resumes the glide to
    // the next seat — so the sample never teleports and never drags through the lid.
    const S = demo.getSample()
    if (S) for (const v of S.vessels) {
      if (!v.userData.docked && !travelTrip(v, dt)) {
        const goal = v.userData.exitLift || v.userData.tPos
        travel(v, goal, dt)
        if (v.userData.exitLift && v.position.distanceTo(v.userData.exitLift) < 0.06) {
          v.userData.exitLift = null // cleared the instrument — glide on to the seat
        }
      }
      v.userData.update?.(dt)
    }
    // 5b · prep vessels ride the SAME rails: each prepared mixture is CARRIED to the
    // station that draws from it, gliding exactly like the sample — never teleporting.
    for (const pv of demo.getPreps()) {
      if (pv.visible && !travelTrip(pv, dt)) travel(pv, pv.userData.tPos, dt)
      pv.userData.update?.(dt)
    }

    // 6 · fade equipment by distance from the rail — active full, neighbours
    // recede into fog, and mid-dolly BOTH stations are visible.
    for (const st of stations) {
      const d = Math.abs(st.x - railX)
      const tgt = demo.clamp(1 - (d - VIS_FULL) / (VIS_GONE - VIS_FULL), 0, 1)
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
  }
  useFrame((state, dt) => {
    lastStateRef.current = state
    if (import.meta.env.DEV && benchLine.hold) return
    frame(state, dt)
  })
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    Object.assign(benchLine, {
      stations: () => stationsRef.current, active: () => activeRef.current,
      sample: () => demo.getSample(), preps: () => demo.getPreps(),
      step: (dt) => frame(lastStateRef.current, dt),
      render: () => { const s = lastStateRef.current; s.gl.render(s.scene, s.camera) },
      camera: () => lastStateRef.current && lastStateRef.current.camera,
    })
    window.__benchLine = benchLine
  }

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
