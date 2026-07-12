// StationScene — mounts the DEMO's real builders AND drives the DEMO's real
// station choreography (demoScene.js, lifted verbatim). Per active step we build
// a station via the demo's stationReagent / stationSpin / addStand + the resident
// pipette rig, call its enter() (initial state), and drive its timeline(p) every
// frame from a per-step animation clock — so the pipette travels bottle→vessel
// and the fill only ramps in at p>0.62, exactly as the demo paces it.
//
// Ours (the parts that generalise): resolveRecipe(action) → which station kind to
// build; the single travelling SAMPLE + container hand-offs; the camera rig
// (cinematic/isometric) + navigation; the DOM overlay.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import { FogExp2, Color, Vector3, Box3, Group, Mesh, TorusGeometry, SphereGeometry, MeshStandardMaterial, PointLight } from 'three'
import { reagentColor } from './theme.js'
import { resolveRecipe, sampleContainerSequence, resolveRemoval, findTransferHandoffDefects } from './sceneRecipe.js'
import { containerContract, resolveInstrument, nestsInto } from './containerContract.js'
import { reagentName, reagentVolume, effectiveStep, selectAlternative, hasAlternatives } from '../lib/runtime.js'
import * as demo from '../scene/demoScene.js'

// the demo's cinematic camera + isometric framing
const FOV = 40
const RAIL_Y = 3.35
const RAIL_Z = 9.6
const LOOK_Y = 1.05
const ISO_DIR = new Vector3(1, 0.82, 1).normalize()
const ISO_DIST = 90
const ISO_LOOK_Y = 1.35
const VIEW_SIZE = 7.6
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
  ;[st.decal].forEach((mesh) => {
    if (mesh?.material) { const m = mesh.material; if (!seen.has(m)) { seen.add(m); st.mats.push({ m, o: m.opacity == null ? 1 : m.opacity, t: !!m.transparent }) } }
  })
}
function applyStationVis(st) {
  const f = st.vis
  if (f <= 0.006) { // fully out — hide and skip material work
    if (st._vstate !== 0) { st.group.visible = false; if (st.decal) st.decal.visible = false; st._vstate = 0 }
    return
  }
  if (st._vstate === 0) { st.group.visible = true; if (st.decal) st.decal.visible = true }
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
  // top = the props' bbox ceiling, so the label can sit just ABOVE the thing it names
  // (centred on center.x), instead of floating over the station origin.
  return { center, radius, top: _frameBox.max.y }
}
const DEFAULT_FRAME = { center: new Vector3(0, LOOK_Y, 0), radius: R_REF }

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
function Lights({ keyRef }) {
  const L = demo.LOOK.cinematic
  return (
    <>
      <ambientLight color={L.amb.color} intensity={L.amb.int * LIGHT_SCALE} />
      <hemisphereLight color={L.hemi.sky} groundColor={L.hemi.ground} intensity={L.hemi.int * LIGHT_SCALE * HEMI_BOOST} />
      <directionalLight
        ref={keyRef}
        color={L.key.color}
        intensity={L.key.int * LIGHT_SCALE}
        position={[5, 11, 7]}
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
    </>
  )
}

// the demo's one continuous resin bench spanning the whole station line.
function Floor({ totalLen }) {
  const floor = useMemo(() => demo.buildFloor(totalLen), [totalLen])
  useEffect(() => () => disposeGroup(floor), [floor])
  return <primitive object={floor} />
}

// Build a station for a step. Every action gets a timeline with VISIBLE motion
// driven by the per-step progress p (0->1): so no station is ever static.
export function configureStation(st, o) {
  const { action, equipment, container, prevContainer, color, name, vol, seconds, startColor, startLevel, endColor, endLevel, cycles } = o
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

  // seat the travelling sample WITHOUT resetting its contents: it enters at the
  // carried-in (start) state, so it continues from where the last step left it.
  const seat = (x, y, z) => {
    S.only(vessel)
    const v = S[vessel]
    if (name) v.userData.setLabel(name, vol || '')
    v.userData.setColor(startColor)
    v.userData.setLevel(startLevel)
    v.visible = true
    v.rotation.set(0, 0, 0)
    v.scale.setScalar(1) // clear any per-station scale (e.g. the thermocycler's shrunk tube)
    S.at(v, st.x + x, FLAT ? 0 : y, z)
    return v
  }

  // evolve the sample's level (and, past the midpoint, its colour) from the
  // carried-in start toward this step's end, paced by p. Returns the base level
  // so callers can add a surface ripple on top.
  const evolve = (p) => {
    const v = S[vessel]
    const base = demo.lerp(startLevel, endLevel, demo.easeInOut(demo.clamp(p, 0, 1)))
    v.userData.setLevel(base)
    if (p > 0.5) v.userData.setColor(endColor)
    return base
  }

  if (action === 'pour_add') {
    // resident pipette rig + bottle; pipette pours over p, fill ramps at p>0.62.
    // cStart/lStart = carried-in state, so the pour builds ON the existing contents.
    // dispense point comes from the CONTRACT (well/neck/centre), not a tube default.
    demo.stationReagent(st, SEAT_Y, { key: 'r', blabel: '', color: endColor, vessel, vlabel: name || '', vsub: vol || '', cStart: startColor, cEnd: endColor, lStart: startLevel, lEnd: endLevel, dispense: C.dispense })
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
        pip.userData.setFluid((1 - dip) * 0.6) // draw up when raised, expel when plunged
      }
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 26) * 0.02) // surface ripple over carried level
    }
  } else if (action === 'vortex_mix') {
    // a real VORTEX MIXER; the vessel presses into its rubber cup and shakes.
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
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 34) * 0.02) // agitation ripple over carried level
    }
  } else if (action === 'discard') {
    // remove liquid — motion follows the CURRENT container: a tube TIPS into the
    // waste; a plate/dish/membrane is ASPIRATED (pipette suck-out — never tip it).
    if (removal === 'aspirate') {
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
          st.pip.userData.setFluid(demo.easeInOut(demo.clamp(p, 0, 1)) * 0.7)
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
    const isNestMove = prevContainer && nestsInto(prevContainer, container)
    if (prevC2 && prevC2.vessel !== vessel && !isNestMove) {
      // CONTENTS MOVE — the sample's LIQUID goes A→B. You do not tip 700 µl of lysate
      // from a tube into a spin column; you aspirate it and dispense it. So this is a
      // PIPETTE RUN, never a stream bridging the two vessels (a free-standing stream
      // reads as a wire, and nothing at a bench moves liquid through open air).
      configurePipetteTransfer(st, S, {
        fromKey: prevC2.vessel, toKey: vessel,
        srcSeatY: prevC2.seat.y, dstSeatY: SEAT_Y,
        srcDisp: prevC2.dispense, dstDisp: C.dispense,
        color: endColor, startLevel, endLevel, name, vol,
      })
      st._skipHandoff = true // the pipette run IS the transition; no lift/settle swap
    } else {
      // VESSEL MOVE (source nests into destination) or a same-vessel transfer: rest at
      // the bench seat; the shared hand-off wrapper below lifts & seats the vessel.
      st.enter = () => seat(0, SEAT_Y, 0)
      st.timeline = (p) => { evolve(p) }
    }
  } else if (equipment === 'centrifuge' || action === 'elute') {
    // benchtop centrifuge, rotor spins over p (verbatim stationSpin). The sample
    // arrives at its carried level and spins down to the chained end level.
    demo.stationSpin(st, BT, { vessel, vlabel: name || '', vsub: vol || '', color: endColor, lStart: startLevel, lEnd: endLevel, cenLabel: 'Centrifuge', cenSub: vol || '', seconds })
  } else if (action === 'incubate_wait') {
    // EQUIPMENT CONTRACT: pick the instrument the container actually goes in — a tube
    // BLOCK for tubes, a plate SHAKER for plates/membranes, a CO₂ INCUBATOR for
    // flasks/dishes. If nothing accepts it, fall back to the bench (never a wrong
    // instrument). A compact progress-timer dial rides over the sample in every case.
    const inst = resolveInstrument('incubate', container)
    st.ring = new Mesh(new TorusGeometry(0.4, 0.02, 12, 64), new MeshStandardMaterial({ color: 0x5a636e, roughness: 0.6 }))
    st.ring.position.set(0, 1.25, 0)
    st.group.add(st.ring)
    st.arc = new Mesh(new TorusGeometry(0.4, 0.05, 14, 64, 0.001), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, toneMapped: false }))
    st.arc.position.set(0, 1.25, 0)
    st.arc.rotation.set(0, 0, Math.PI / 2)
    st.group.add(st.arc)
    st._arcP = -1
    let seatFn = () => S.at(S[vessel], st.x, SEAT_Y, 0)
    let motionFn = null
    if (inst === 'plate_shaker') {
      const shaker = demo.buildPlateShaker()
      st.group.add(shaker); st.updatables.push(shaker)
      seatFn = () => S.at(S[vessel], st.x, 0.62, 0) // rides the platform
      motionFn = (p) => { const a = p * 40; shaker.userData.setOrbit(a); S.at(S[vessel], st.x + Math.cos(a) * 0.06, 0.62, Math.sin(a) * 0.06) }
    } else if (inst === 'co2_incubator') {
      const inc = demo.buildCO2Incubator(); inc.position.set(0, 0, -1.1)
      st.group.add(inc); st.updatables.push(inc)
      seatFn = () => { S.at(S[vessel], st.x, 0.66, -1.25); inc.userData.setDoor(false) } // flask on the lower shelf, inside
      st.ring.position.set(0, 2.05, 0); st.arc.position.set(0, 2.05, 0) // timer above the cabinet
      // The DETACHMENT is the whole point of the step but it's small + behind glass.
      // As the step resolves: OPEN the door and PUSH the camera in close on the flask
      // (contract framing 'wide' → a low, close frame) so the detached cells read.
      motionFn = (p) => { inc.userData.setDoor(p > 0.5) }
      st.pushCam = (p) => demo.easeInOut(demo.clamp((p - 0.35) / 0.4, 0, 1))
      st.pushTarget = C.framing === 'wide'
        ? { pos: [0, 1.2, 3.7], look: [0, 0.62, -1.25] }   // level, between the shelves, on the flask
        : { pos: [0, 1.4, 3.0], look: [0, 0.9, -1.0] }
    } else if (inst === 'incubation_block') {
      const block = demo.buildColdBlock(); block.position.set(0, 0, -1.25)
      st.group.add(block); st.updatables.push(block)
      seatFn = () => S.at(S[vessel], st.x, BT, 0) // the block is a RISER — the tube sits IN its well, not on the bench
    }
    st.enter = () => { seat(0, SEAT_Y, 0); seatFn(); const v = S[vessel]; if (v.userData.setMono) v.userData.setMono(1) }
    st.timeline = (p) => {
      if (Math.abs(p - st._arcP) > 0.02) {
        st._arcP = p
        st.arc.geometry.dispose()
        st.arc.geometry = new TorusGeometry(0.4, 0.05, 14, 64, Math.max(0.001, p * Math.PI * 2))
      }
      const v = S[vessel]
      // contentsState (passaging hero): during a flask incubation the adherent
      // MONOLAYER visibly DETACHES (trypsinisation) — confluent → cleared.
      if (v.userData.setMono) v.userData.setMono(1 - demo.easeInOut(demo.clamp((p - 0.3) / 0.5, 0, 1)))
      v.userData.setLevel(evolve(p) + Math.sin(p * 10) * 0.02) // holds carried contents
      if (motionFn) motionFn(p)
    }
  } else if (action === 'heat') {
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
    st.bubbles = Array.from({ length: 8 }, () => {
      const b = new Mesh(new SphereGeometry(0.045, 10, 8), new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0.1 }))
      b.userData.seed = { x: (Math.random() - 0.5) * 1.6, z: (Math.random() - 0.5) * 1.0, off: Math.random(), sp: 0.5 + Math.random() }
      st.group.add(b)
      return b
    })
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
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 12) * 0.02) // holds carried contents
    }
  } else if (action === 'cool_ice') {
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
      S[vessel].rotation.z = Math.sin(p * 30) * 0.02 // faint cold shiver
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
      tc.userData.setLid(!(p > 0.12 && p < 0.9)) // lid CLOSED over the loaded tube while cycling
      tc.userData.setProgress(p, n)
      evolve(p) // contents unchanged; the tube just cycles temperature
    }
  } else if (action === 'electrophorese') {
    // load the sample and run the gel: bands migrate, voltage ramps.
    const gel = demo.buildGelRig()
    st.group.add(gel)
    st.updatables.push(gel)
    st.dev = gel
    st.enter = () => seat(-1.7, SEAT_Y, 0.9) // sample waits beside the tank (loaded into it)
    st.timeline = (p) => { evolve(p); gel.userData.setProgress?.(p) }
  } else if (action === 'store') {
    // end-state storage: the vessel glides INTO the freezer; the door closes; frost breathes.
    const fr = demo.buildFreezer()
    fr.position.set(0.1, 0, -1.5)
    st.group.add(fr)
    st.updatables.push(fr)
    st.dev = fr
    st.cold = new PointLight(0x8fbaf0, 0, 4)
    st.cold.position.set(0, 1, -0.6)
    st.group.add(st.cold)
    // The cavity opening faces +z (spans y≈0.30–1.80). The vial must enter THROUGH
    // the opening — never through a wall. CRITICAL: it stays LOW (base y≈0.4, so its
    // cap tops out ~1.6, well under the cavity/box top) the entire time it is at or
    // inside the freezer, and only hops UP while still out in front of the box (never
    // over it). Door opens first; closes only once the vial is fully inside.
    const bench = { x: -1.4, y: SEAT_Y, z: 0.9 }
    const front = { x: 0.1, y: 0.4, z: 0.4 }    // staged low, in front of the mouth
    const inside = { x: 0.1, y: 0.4, z: -1.0 }  // seated on the cavity floor (same low y)
    const move = (v, a, b, q) => S.at(v, st.x + demo.lerp(a.x, b.x, q), demo.lerp(a.y, b.y, q), demo.lerp(a.z, b.z, q))
    st.enter = () => { seat(bench.x, bench.y, bench.z); fr.userData.setDoor(true); fr.userData.setFrost(0); st.cold.intensity = 0 }
    st.timeline = (p) => {
      evolve(p)
      const v = S[vessel]
      fr.userData.setDoor(p < 0.66)  // open until the vial is seated inside, then close
      if (p < 0.14) {                // 1 · door swings open; vial waits on the bench
        S.at(v, st.x + bench.x, bench.y, bench.z)
      } else if (p < 0.42) {         // 2 · approach the opening — hop stays OUT in front of the box
        const q = demo.easeInOut((p - 0.14) / 0.28)
        S.at(v, st.x + demo.lerp(bench.x, front.x, q), demo.lerp(bench.y, front.y, q) + Math.sin(q * Math.PI) * 0.45, demo.lerp(bench.z, front.z, q))
      } else if (p < 0.66) {         // 3 · move STRAIGHT IN through the opening (−z only, low)
        move(v, front, inside, demo.easeInOut((p - 0.42) / 0.24))
      } else {                       // 4 · inside, door closed — deep-cold cast + frost puff
        S.at(v, st.x + inside.x, inside.y, inside.z)
        st.cold.intensity = (p - 0.66) * 5
        fr.userData.setFrost(0.4 * Math.max(0, Math.sin((p - 0.66) * 7)))
      }
    }
  } else if (action === 'seed') {
    // dispense the sample into the culture vessel; on agar, a spreader then sweeps it out.
    demo.stationReagent(st, SEAT_Y, { key: 'r', blabel: '', color: endColor, vessel, vlabel: name || '', vsub: vol || '', cStart: startColor, cEnd: endColor, lStart: startLevel, lEnd: endLevel, dispense: C.dispense })
    if (container === 'agar_plate') {
      const spr = demo.buildSpreader()
      spr.scale.setScalar(0.9)
      spr.visible = false
      st.group.add(spr)
      const base = st.timeline
      st.timeline = (p) => {
        base(p)
        spr.visible = p > 0.55
        const a = demo.clamp((p - 0.55) / 0.4, 0, 1) * Math.PI * 3 // sweeping circles
        spr.position.set(Math.cos(a) * 0.42, 0.2, Math.sin(a) * 0.36)
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
  } else if (equipment === 'reader') {
    // EQUIPMENT CONTRACT: read each vessel on the instrument it actually goes in — a
    // 96-well plate on a PLATE READER, a tube on a NanoDrop, a culture flask under an
    // INVERTED MICROSCOPE, a slide under a LIGHT MICROSCOPE (100× oil), a gel on a UV
    // TRANSILLUMINATOR. The vessel rests on/in the instrument while it reads — no spin.
    const inst = resolveInstrument('measure', container)
    // rest the sample on an instrument's stage at its stated height (flat vessels are
    // otherwise pinned to the bench by seat()'s FLAT guard), reading progress ramping.
    const onStage = (dev, sy, k = 1.3) => {
      st.dev = dev; st.group.add(dev); st.updatables.push(dev)
      st.enter = () => { seat(0, 0, 0); S.at(S[vessel], st.x, sy, 0); dev.userData.setProgress?.(0) }
      st.timeline = (p) => { evolve(p); S.at(S[vessel], st.x, sy, 0); dev.userData.setProgress?.(demo.easeInOut(demo.clamp(p * k, 0, 1))) }
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
      onStage(scope, scope.userData.stageY)
    } else if (inst === 'uv_transilluminator') {
      const tl = demo.buildUVTransilluminator()
      onStage(tl, tl.userData.stageY)
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
  const custom = action === 'store' || equipment === 'centrifuge'
  if (prevVessel && prevVessel !== vessel && !custom && !st._skipHandoff) {
    wrapHandoff(st, S, prevVessel, vessel, startColor, startLevel)
  }
  hideLabels(st.group)
}

// Wrap a station's enter/timeline with a visible container hand-off: for the first
// TR of the step the OLD vessel lifts up and out (remove motion) and the NEW vessel
// descends into its seat (insert motion) — the two halves of one transition. Then the
// station's real action runs on the remapped remainder. Uses snapTo (position == tPos)
// so the swap is crisp and the frame-loop glide never fights it.
function wrapHandoff(st, S, fromKey, toKey, color, level) {
  const baseEnter = st.enter
  const baseTimeline = st.timeline
  const TR = 0.26   // fraction of the step spent on the hand-off
  const LIFT = 2.0  // vertical travel of the swap (kept low so it never clips the HUD)
  st.enter = () => {
    baseEnter && baseEnter()             // seats the NEW vessel at its target + sets its state
    const nv = S[toKey]
    st._seat = nv.userData.tPos.clone()  // where the new vessel belongs
    const ov = S[fromKey]
    ov.visible = true                    // the OLD vessel carries the incoming contents in
    ov.rotation.set(0, 0, 0)
    ov.userData.setColor?.(color)
    ov.userData.setLevel?.(level)
    S.snapTo(ov, st._seat.x, st._seat.y, st._seat.z)
    nv.visible = false                   // hide the new one until it descends
    st._handoff = true
  }
  st.timeline = (p) => {
    if (p < TR) {
      const q = p / TR
      const ov = S[fromKey]
      const nv = S[toKey]
      if (q < 0.5) {                     // old vessel lifts up & aside (remove)
        ov.visible = true; nv.visible = false
        const e = demo.easeInOut(q / 0.5)
        S.snapTo(ov, st._seat.x, st._seat.y + e * LIFT, st._seat.z)
        ov.rotation.z = e * 0.5
      } else {                           // new vessel settles down into the seat (insert)
        ov.visible = false; nv.visible = true
        const e = demo.easeInOut((q - 0.5) / 0.5)
        nv.userData.setColor?.(color)
        nv.userData.setLevel?.(level)
        S.snapTo(nv, st._seat.x, st._seat.y + (1 - e) * LIFT, st._seat.z)
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
// only once the tip is dispensing (the same p>0.62 gate as a reagent add); the colour
// travels with it. We reveal both vessels, then lock to the destination.
function configurePipetteTransfer(st, S, o) {
  const { fromKey, toKey, srcSeatY, dstSeatY, srcDisp, dstDisp, color, startLevel, endLevel, name, vol } = o
  const AX = -0.95, BX = 0.85, Z = 0.1
  // aspirate over the SOURCE (tip dips in from srcSeatY, then rises) and dispense at the
  // DESTINATION's contract mouth (straight into a tube; angled down a flask's neck).
  const dstAngled = dstDisp && dstDisp.approach === 'angled'
  const from = { x: AX + (srcDisp?.x || 0), y: srcSeatY, z: Z + (srcDisp?.z || 0) }
  const to = { x: BX + (dstDisp?.x || 0), y: dstAngled && dstDisp.y != null ? dstDisp.y : dstSeatY, z: Z + (dstDisp?.z || 0) }
  // frame BOTH vessels (base → top of each) so the fit keeps them centred, not the tall
  // pipette (which is excluded from the frame).
  st.frameAnchors = [
    new Vector3(AX, srcSeatY, Z), new Vector3(AX, srcSeatY + 1.7, Z),
    new Vector3(BX, dstSeatY, Z), new Vector3(BX, dstSeatY + 1.7, Z),
  ]

  demo.addPipetteRig(st)

  st.enter = () => {
    S.only(toKey)
    const a = S[fromKey], b = S[toKey]
    a.visible = true; b.visible = true
    a.rotation.set(0, 0, 0); b.rotation.set(0, 0, 0)
    if (name) a.userData.setLabel?.(name, vol || '')
    a.userData.setColor?.(color); a.userData.setLevel?.(startLevel)
    b.userData.setColor?.(color); b.userData.setLevel?.(0.03)
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
    demo.pipetteRun(st, from, to, p, { color, fill: 0.8, approach: dstDisp?.approach, tilt: dstDisp?.tilt, depth: dstDisp?.depth })
    // SOURCE drains while the tip aspirates (pipetteRun's draw phase ends at p≈0.26).
    a.userData.setLevel?.(demo.lerp(startLevel, 0.03, demo.easeInOut(demo.clamp(p / 0.26, 0, 1))))
    // DEST fills only once the tip is dispensing — respect the p>0.62 gate (no early fill).
    if (p > 0.62) {
      const q = demo.easeInOut((p - 0.62) / 0.38)
      b.userData.setColor?.(color)
      b.userData.setLevel?.(demo.lerp(0.03, endLevel, q))
    }
    if (p > 0.98) { a.visible = false; S.only(toKey); S.snapTo(b, st.x + BX, dstSeatY, Z) }
  }
}

function useContainers(steps) {
  return useMemo(() => sampleContainerSequence(steps), [steps])
}

// Per-step build + display params for one station in the line.
function stationParams(baseStep, lang, altIdx, chain) {
  const step = effectiveStep(baseStep, altIdx) // follow the chosen either/or method
  const { equipment } = resolveRecipe(step.action)
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
  return { action: step.action, equipment, colorHex, vol, title, sub, seconds: step.duration_seconds, start, end, cycles }
}

export default function StationScene({ protocol, activeIndex = 0, lang = 'en', view = 'cinematic', altByStep = {} }) {
  ensureMaps()
  const { gl, scene, size } = useThree()
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
      // A preparation step that MAKES a reagent (lysis buffer, RPE, DNase mix) is a
      // SEPARATE tube, not the travelling sample. Render it self-contained in its own
      // reagent colour and DON'T carry into/out of the sample chain — otherwise its
      // liquid morphs through the previous reagent's colour (blue→pink→orange).
      if (s.phase === 'preparation' && prim) {
        const lo = eff.action === 'pour_add' ? Math.min(0.12, f) : f
        return { start: { color: c, level: lo }, end: { color: c, level: f } }
      }
      const start = { color, level }
      const end = stepEnd(eff.action, start, c, f)
      color = end.color
      level = end.level
      return { start, end }
    })
  }, [steps, lang, altByStep])

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
  const orthoRef = useRef()
  const keyRef = useRef()

  // one-time scene setup + the persistent travelling SAMPLE (added to the scene).
  useEffect(() => {
    demo.setRenderer(gl)
    demo.setScene(scene)
    ensureMaps()
    scene.environment = demo.buildEnvMap('cinematic')
    scene.background = demo.makeCineBackdrop()
    // the background texture renders ~15 RGB darker in modern three than r128;
    // lift it so the wall matches the demo's greige (measured, not eyeballed).
    scene.environmentIntensity = 2.5
    scene.backgroundIntensity = 1.19
    const f = demo.LOOK.cinematic.fog
    scene.fog = new FogExp2(f.color, f.density)
    const S = demo.initSample()
    S.vessels.forEach((v) => v.userData.label && (v.userData.label.visible = false))
    return () => {
      S.vessels.forEach((v) => {
        scene.remove(v)
        disposeGroup(v)
      })
      scene.environment = null
      scene.background = null
      scene.fog = null
    }
  }, [gl, scene])

  // the key light's shadow target follows the framed station (kept in the graph).
  useEffect(() => {
    if (keyRef.current) scene.add(keyRef.current.target)
  }, [scene])

  // ── BUILD THE WHOLE LINE ONCE — one station per step along +X at SPACING.
  // Rebuilds ONLY on a structural change (protocol / language / chosen method),
  // NEVER on step navigation. Stations persist for the session; a step change
  // only dollies the camera and glides the single sample. ──
  useEffect(() => {
    if (!demo.getSample()) return undefined
    // A transfer whose destination container == the previous container never actually
    // moves the sample — the parse omitted the destination and it carried forward.
    // Warn loudly; a silent fallback is exactly how the "load column" defect hid.
    for (const d of findTransferHandoffDefects(steps)) {
      console.warn(`[benchpilot] transfer step ${d.index} does not name a destination container ` +
        `(stays "${d.container}") — the hand-off cannot fire. This is a parse defect: every transfer must set \`container\`.`)
    }
    const stations = []
    steps.forEach((baseStep, i) => {
      const altIdx = altByStep[baseStep.index] || 0
      const container = containers[i] || 'microtube'
      const prevContainer = i > 0 ? (containers[i - 1] || 'microtube') : null
      const o = stationParams(baseStep, lang, altIdx, stateChain[i])
      const st = { group: new Group(), updatables: [], reagents: {}, pip: null, enter: null, timeline: null, x: i * SPACING, cen: null, dev: null, vis: 0, _vstate: -1 }
      configureStation(st, {
        action: o.action, equipment: o.equipment, container, prevContainer, color: o.colorHex, name: o.title, vol: o.vol, seconds: o.seconds,
        startColor: o.start.color, startLevel: o.start.level, endColor: o.end.color, endLevel: o.end.level, cycles: o.cycles,
      })
      // MEASURE the framing from the equipment now — group is still at the origin and
      // carries only the instrument (not the label/decal added below), so this is the
      // station's true content extent in local coords.
      st.frame = computeStationFrame(st)
      st.group.position.set(st.x, 0, 0)
      // the title sits just ABOVE the thing the step is about — the props' bbox top,
      // centred on it — not over the station origin. Its own half-height (worldH/2)
      // plus a small gap put the plate's BOTTOM edge clear of the subject.
      const label = demo.makeLabel(o.title, o.sub)
      const LABEL_GAP = 0.5
      const halfH = (label.userData.worldH || 0.5) / 2
      label.position.set(st.frame.center.x, st.frame.top + LABEL_GAP + halfH, st.frame.center.z)
      st.group.add(label)
      scene.add(st.group)
      // the bench station number in front
      const decal = demo.stationDecal(i + 1)
      decal.position.set(st.x, 0.02, 2.4)
      scene.add(decal)
      st.decal = decal
      collectStationMats(st) // snapshot opacities so the unit fades as one
      stations.push(st)
    })
    stationsRef.current = stations

    // frame + seat the active station: snap the sample there, park the camera on it.
    const a = Math.max(0, Math.min(active, stations.length - 1))
    railXRef.current = stations[a] ? stations[a].x : 0
    targetXRef.current = railXRef.current
    glideRef.current = { active: false, t: 0, from: railXRef.current, to: railXRef.current }
    demo.undockSample() // in case a rebuild interrupted a spin
    demo.setSnap(true)
    stations[a]?.enter?.()
    demo.setSnap(false)
    pRef.current = 0
    restartRef.current = true
    activeRef.current = a
    prevActiveRef.current = a

    return () => {
      for (const st of stations) {
        scene.remove(st.group)
        disposeGroup(st.group)
        if (st.decal) { scene.remove(st.decal); disposeGroup(st.decal) }
      }
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
    // the single sample glides (sequential) or snaps (jump) to the new station
    demo.undockSample() // if we left a spin mid-way, free the sample from the rotor
    demo.getSample()?.vessels.forEach((v) => v.rotation.set(0, 0, 0))
    demo.setSnap(!sequential)
    stations[active].enter?.()
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

    // 1 · ease railX toward the active station's X
    const g = glideRef.current
    if (g.active) {
      g.t = Math.min(g.t + dt / GLIDE_DUR, 1)
      railXRef.current = demo.lerp(g.from, g.to, demo.easeInOut(g.t))
      if (g.t >= 1) { g.active = false; railXRef.current = g.to }
    }
    const railX = railXRef.current

    // 2 · position the active camera — pure lateral tracking, no orbit — aimed and
    // fit on the active station's MEASURED content frame (never an assumed origin).
    const actCam = stations[activeRef.current]
    const f = actCam && actCam.frame ? actCam.frame : DEFAULT_FRAME
    const fit = demo.clamp(f.radius / R_REF, 1, 1.7) // back off only for oversized rigs
    if (view === 'isometric') {
      const cam = orthoRef.current
      if (cam) {
        const tx = railX + f.center.x + Math.sin(time * 0.12) * 0.07
        cam.position.set(tx + ISO_DIR.x * ISO_DIST, f.center.y + ISO_DIR.y * ISO_DIST, f.center.z + ISO_DIR.z * ISO_DIST)
        cam.up.set(0, 1, 0)
        cam.lookAt(tx, f.center.y, f.center.z)
      }
    } else {
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
      }
    }

    // 3 · the key light + its shadow frustum follow the framed station
    const k = keyRef.current
    if (k) {
      const lx = targetXRef.current
      k.position.set(lx + 5, 11, 7)
      k.target.position.set(lx, 0.6, 0)
      k.target.updateMatrixWorld()
    }

    // 4 · run ONLY the active station's p-timeline (others idle)
    const act = stations[activeRef.current]
    if (act) {
      if (restartRef.current) { pRef.current = 0; restartRef.current = false }
      pRef.current = Math.min(pRef.current + dt / STEP_DUR, 1)
      act.timeline?.(pRef.current)
    }
    for (const st of stations) for (const u of st.updatables) u.userData?.update?.(dt)

    // 5 · the ONE sample eases toward its world target — glides station→station.
    // While docked in a centrifuge rotor slot the rotor owns its transform, so skip
    // the glide (but still tick its liquid).
    const S = demo.getSample()
    if (S) for (const v of S.vessels) {
      if (!v.userData.docked) v.position.lerp(v.userData.tPos, 1 - Math.pow(0.02, dt))
      v.userData.update?.(dt)
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
  })

  const zoom = size.height / (2 * VIEW_SIZE)
  return (
    <>
      <Lights keyRef={keyRef} />
      <Floor totalLen={totalLen} />
      <PerspectiveCamera ref={perspRef} makeDefault={view !== 'isometric'} fov={FOV} near={0.1} far={260} position={[0, RAIL_Y, RAIL_Z]} />
      <OrthographicCamera ref={orthoRef} makeDefault={view === 'isometric'} near={0.1} far={400} zoom={zoom} position={[ISO_DIR.x * ISO_DIST, ISO_LOOK_Y + ISO_DIR.y * ISO_DIST, ISO_DIR.z * ISO_DIST]} />
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
