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
import { FogExp2, Color, Vector3, Group, Mesh, TorusGeometry, SphereGeometry, MeshStandardMaterial, PointLight } from 'three'
import { reagentColor } from './theme.js'
import { resolveRecipe, sampleContainerSequence } from './sceneRecipe.js'
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

const V_OF = { microtube: 'tube', spin_column: 'column', eluate_tube: 'elu' }

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
    case 'wash': return { color, level: 0.12 } // wash buffer flows through
    case 'centrifuge': return { color: prev.color, level: 0.2 } // spun down, supernatant/flow-through gone
    case 'elute': return { color, level: 0.45 } // eluate collected
    case 'discard': return { color: prev.color, level: 0.05 }
    default: return { color: prev.color, level: prev.level } // vortex / homogenize / incubate / heat / cool / measure — no change
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
function Lights() {
  const L = demo.LOOK.cinematic
  return (
    <>
      <ambientLight color={L.amb.color} intensity={L.amb.int * LIGHT_SCALE} />
      <hemisphereLight color={L.hemi.sky} groundColor={L.hemi.ground} intensity={L.hemi.int * LIGHT_SCALE * HEMI_BOOST} />
      <directionalLight
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

// the demo's textured resin floor (light warm cream), not a flat plane.
function Floor() {
  const floor = useMemo(() => demo.buildFloor(), [])
  return <primitive object={floor} />
}

function CameraRig({ view }) {
  const persp = useRef()
  const ortho = useRef()
  const { size } = useThree()
  const zoom = size.height / (2 * VIEW_SIZE)
  useFrame(() => {
    if (view === 'isometric') ortho.current?.lookAt(0, ISO_LOOK_Y, 0)
    else persp.current?.lookAt(0, LOOK_Y, 0)
  })
  return (
    <>
      <PerspectiveCamera ref={persp} makeDefault={view !== 'isometric'} fov={FOV} near={0.1} far={160} position={[0, RAIL_Y, RAIL_Z]} />
      <OrthographicCamera ref={ortho} makeDefault={view === 'isometric'} near={0.1} far={400} zoom={zoom} position={[ISO_DIR.x * ISO_DIST, ISO_LOOK_Y + ISO_DIR.y * ISO_DIST, ISO_DIR.z * ISO_DIST]} />
    </>
  )
}

// Build a station for a step. Every action gets a timeline with VISIBLE motion
// driven by the per-step progress p (0->1): so no station is ever static.
function configureStation(st, o) {
  const { action, equipment, container, color, name, vol, seconds, startColor, startLevel, endColor, endLevel } = o
  const vessel = V_OF[container] || 'tube'
  const S = demo.getSample()
  const BT = demo.BLOCK_TOP

  // seat the travelling sample WITHOUT resetting its contents: it enters at the
  // carried-in (start) state, so it continues from where the last step left it.
  const seat = (x, y, z) => {
    S.only(vessel)
    const v = S[vessel]
    if (name) v.userData.setLabel(name, vol || '')
    v.userData.setColor(startColor)
    v.userData.setLevel(startLevel)
    v.rotation.set(0, 0, 0)
    S.at(v, st.x + x, y, z)
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
    demo.stationReagent(st, BT, { key: 'r', blabel: '', color: endColor, vessel, vlabel: name || '', vsub: vol || '', cStart: startColor, cEnd: endColor, lStart: startLevel, lEnd: endLevel })
  } else if (action === 'pipette_mix') {
    // pipette aspirates + dispenses in repeated passes (reuse pipetteRun); ripple.
    demo.addPipetteRig(st)
    st.enter = () => { seat(0, BT, 0); demo.pipRest(st) }
    st.timeline = (p) => {
      const cp = (p * 3) % 1 // 3 mixing passes
      demo.pipetteRun(st, { x: 0, y: BT, z: 0 }, { x: 0, y: BT, z: 0 }, cp, { color: endColor, fill: 0.7 })
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 26) * 0.02) // surface ripple over carried level
    }
  } else if (action === 'vortex_mix') {
    // the vessel visibly swirls + wobbles (this was the dead one).
    demo.addStand(st)
    st.enter = () => seat(0, BT, 0)
    st.timeline = (p) => {
      const v = S[vessel]
      evolve(p) // holds the carried contents (start == end for a vortex)
      v.rotation.y = p * 26 // many turns (monotonic)
      v.rotation.z = Math.sin(p * 46) * 0.14 // rapid wobble
    }
  } else if (action === 'homogenize') {
    // MANUAL homogenization: a syringe dips into the tube and the plunger pumps
    // repeatedly (pass the lysate through a 20-21 G needle). NO centrifuge.
    demo.addStand(st)
    const syr = demo.buildSyringe()
    syr.userData.setColor(endColor)
    syr.position.set(0.1, BT + 0.05, 0.1) // beside the tube, needle dipping toward its mouth
    syr.rotation.z = -0.3 // tilt like a hand holding it
    syr.scale.setScalar(0.8)
    st.group.add(syr)
    st.updatables.push(syr)
    st.enter = () => seat(0, BT, 0)
    st.timeline = (p) => {
      const passes = 5 // "pass 5 times through the needle"
      const cp = (p * passes) % 1
      syr.userData.setPlunge(cp < 0.5 ? cp * 2 : (1 - cp) * 2) // press down then draw up
      syr.userData.setColor(endColor)
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 34) * 0.02) // agitation ripple over carried level
    }
  } else if (action === 'discard') {
    // the vessel tips over a waste beaker and drains the flow-through.
    demo.addStand(st)
    const waste = demo.buildWaste()
    waste.position.set(1.3, 0, 0.6)
    waste.scale.setScalar(0.9)
    st.group.add(waste)
    st.updatables.push(waste)
    st.enter = () => seat(0, 0.7, 0)
    st.timeline = (p) => {
      const e = demo.easeInOut(demo.clamp(p, 0, 1))
      const v = S[vessel]
      v.rotation.z = -e * 1.2 // tip toward the waste
      evolve(p) // drain from the carried level down to the discard end level
    }
  } else if (action === 'transfer') {
    // hand-off: the sample moves tube -> spin column (the demo's LOAD step). NO
    // centrifuge — the column fills as the tube drains.
    demo.addStand(st)
    const tA = { x: -0.9, y: BT, z: 0.1 }
    const cA = { x: 0.7, y: BT, z: 0.1 }
    st.enter = () => {
      // the tube arrives carrying its contents; the same liquid pours into the column.
      S.only('tube')
      S.tube.userData.setLabel(name || 'Sample', 'load column')
      S.tube.userData.setColor(startColor)
      S.tube.userData.setLevel(startLevel)
      S.tube.rotation.set(0, 0, 0)
      S.at(S.tube, st.x + tA.x, tA.y, tA.z)
      S.column.userData.setLabel('RNeasy column', 'loading')
      S.column.userData.setColor(startColor)
      S.column.userData.setLevel(0)
      S.column.rotation.set(0, 0, 0)
      S.snapTo(S.column, st.x + cA.x, cA.y, cA.z)
      S.column.visible = false
    }
    st.timeline = (p) => {
      S.tube.visible = true
      if (p > 0.2) S.column.visible = true
      const f = demo.clamp((p - 0.25) / 0.5, 0, 1)
      S.column.userData.setLevel(demo.lerp(0, endLevel, f))
      S.tube.userData.setLevel(demo.lerp(startLevel, 0.04, f))
      if (p > 0.9) S.tube.visible = false
    }
  } else if (equipment === 'centrifuge' || action === 'wash' || action === 'elute') {
    // benchtop centrifuge, rotor spins over p (verbatim stationSpin). The sample
    // arrives at its carried level and spins down to the chained end level.
    demo.stationSpin(st, BT, { vessel, vlabel: name || '', vsub: vol || '', color: endColor, lStart: startLevel, lEnd: endLevel, cenLabel: 'Centrifuge', cenSub: vol || '', seconds })
  } else if (action === 'incubate_wait') {
    // incubation block + a progress RING that fills with p.
    demo.addStand(st)
    const block = demo.buildColdBlock()
    st.group.add(block)
    st.updatables.push(block)
    st.ring = new Mesh(new TorusGeometry(0.55, 0.02, 12, 64), new MeshStandardMaterial({ color: 0x5a636e, roughness: 0.6 }))
    st.ring.position.set(0, 2.0, 0)
    st.ring.rotation.x = Math.PI / 2
    st.group.add(st.ring)
    st.arc = new Mesh(new TorusGeometry(0.55, 0.05, 14, 64, 0.001), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, toneMapped: false }))
    st.arc.position.set(0, 2.0, 0)
    st.arc.rotation.set(Math.PI / 2, 0, Math.PI / 2)
    st.group.add(st.arc)
    st._arcP = -1
    st.enter = () => seat(0, BT, 0)
    st.timeline = (p) => {
      if (Math.abs(p - st._arcP) > 0.02) {
        st._arcP = p
        st.arc.geometry.dispose()
        st.arc.geometry = new TorusGeometry(0.55, 0.05, 14, 64, Math.max(0.001, p * Math.PI * 2))
      }
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 10) * 0.02) // holds carried contents
    }
  } else if (action === 'heat') {
    // heat block + rising bubbles + a warm glow that ramps with p.
    demo.addStand(st)
    const block = demo.buildColdBlock()
    st.group.add(block)
    st.updatables.push(block)
    st.warm = new PointLight(0xff8a3d, 0, 5)
    st.warm.position.set(0, 1.1, 0.5)
    st.group.add(st.warm)
    st.bubbles = Array.from({ length: 8 }, () => {
      const b = new Mesh(new SphereGeometry(0.05, 10, 8), new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0.1 }))
      b.userData.seed = { x: (Math.random() - 0.5) * 0.4, z: (Math.random() - 0.5) * 0.4, off: Math.random(), sp: 0.5 + Math.random() }
      st.group.add(b)
      return b
    })
    st.enter = () => seat(0, BT, 0)
    st.timeline = (p) => {
      st.warm.intensity = p * 3.2 // warm glow ramps up (monotonic)
      for (const b of st.bubbles) {
        const s = b.userData.seed
        const yy = (p * s.sp * 3 + s.off) % 1
        b.position.set(s.x, BT + 0.2 + yy * 1.3, s.z)
        b.scale.setScalar(0.5 + yy)
      }
      S[vessel].userData.setLevel(evolve(p) + Math.sin(p * 12) * 0.02) // holds carried contents
    }
  } else if (action === 'cool_ice') {
    // ice bucket + a cold cast that deepens with p (frost creep) + a faint shiver.
    demo.addStand(st)
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
  } else if (equipment === 'reader') {
    // NanoDrop reads the sample; its trace draws in with p.
    const nano = demo.buildNanoDrop()
    st.group.add(nano)
    st.updatables.push(nano)
    st.dev = nano
    demo.addStand(st)
    st.enter = () => seat(-1.4, 0, 0.8)
    st.timeline = (p) => {
      evolve(p) // holds the carried contents while the reader traces
      nano.userData.setProgress?.(demo.easeInOut(demo.clamp(p * 1.4, 0, 1)))
    }
  } else {
    // generic actionable (rare) — a slow idle turn so it is never dead.
    demo.addStand(st)
    st.enter = () => seat(0, BT, 0)
    st.timeline = (p) => { evolve(p); S[vessel].rotation.y = p * 3 }
  }
  hideLabels(st.group)
}

function useContainers(steps) {
  return useMemo(() => sampleContainerSequence(steps.map((s) => s.action)), [steps])
}

export default function StationScene({ protocol, activeIndex = 0, lang = 'en', view = 'cinematic', altByStep = {} }) {
  ensureMaps()
  const { gl, scene } = useThree()
  const steps = protocol?.steps || []
  const containers = useContainers(steps)
  const active = Math.max(0, Math.min(activeIndex, steps.length - 1))
  const baseStep = steps[active] || { action: 'generic', reagents: [] }
  // Follow the CHOSEN alternative (either/or method) — the station, action and
  // title all come from the selected branch, not the primary. Picking the needle
  // option builds a syringe, not the QIAshredder centrifuge.
  const altIdx = altByStep[baseStep.index] || 0
  const step = effectiveStep(baseStep, altIdx)
  const { equipment } = resolveRecipe(step.action)
  const container = containers[active] || 'microtube'

  const primary = (step.reagents || []).find((r) => r.volume) || (step.reagents || [])[0]
  const primaryName = primary ? reagentName(primary, lang) : null
  const colorHex = useMemo(() => new Color(reagentColor(primaryName)).getHex(), [primaryName])
  const fill = resolveRecipe(step.action).anim.fill
  const vol = (primary && reagentVolume(primary, lang)) || ''
  const labelTitle = primaryName || ACTION_LABEL[step.action] || 'Step'
  const labelSub = vol || (step.spin?.rcf_min ? `≥ ${step.spin.rcf_min.toLocaleString()} ×g` : '')

  // The sample's carried contents at EVERY step, as a pure fold over the protocol:
  // step N's start state == step N-1's end state. Computed for all steps (not a
  // mutable ref) so a deep-link/back jump still resolves the right carried state.
  const stateChain = useMemo(() => {
    let color = INIT_COLOR
    let level = INIT_LEVEL
    return steps.map((s) => {
      const eff = hasAlternatives(s) ? selectAlternative(s, altByStep[s.index] || 0) : s
      const prim = (eff.reagents || []).find((r) => r.volume) || (eff.reagents || [])[0]
      const c = new Color(reagentColor(prim ? reagentName(prim, lang) : null)).getHex()
      const f = resolveRecipe(eff.action).anim.fill
      const start = { color, level }
      const end = stepEnd(eff.action, start, c, f)
      color = end.color
      level = end.level
      return { start, end }
    })
  }, [steps, lang, altByStep])
  const chainAt = stateChain[active] || { start: { color: INIT_COLOR, level: INIT_LEVEL }, end: { color: colorHex, level: fill } }

  const stRef = useRef(null)
  const pRef = useRef(0)
  const restartRef = useRef(true)
  const prevActiveRef = useRef(-1)

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

  // per active step: build the station, snap the sample in, run enter(), reset clock.
  useEffect(() => {
    if (!demo.getSample()) return undefined
    const st = { group: new Group(), updatables: [], reagents: {}, pip: null, enter: null, timeline: null, x: 0, cen: null, dev: null }
    configureStation(st, {
      action: step.action, equipment, container, color: colorHex, name: labelTitle, vol, seconds: step.duration_seconds,
      startColor: chainAt.start.color, startLevel: chainAt.start.level,
      endColor: chainAt.end.color, endLevel: chainAt.end.level,
    })
    scene.add(st.group)
    // clear any leftover swirl/tip from the previous step's motion timeline.
    demo.getSample().vessels.forEach((v) => v.rotation.set(0, 0, 0))
    // GLIDE the sample when stepping one at a time (it visibly travels to the new
    // station carrying its contents); SNAP on the first mount or a non-sequential
    // jump (deep-link/back), exactly as the demo does.
    const sequential = prevActiveRef.current >= 0 && Math.abs(active - prevActiveRef.current) === 1
    demo.setSnap(!sequential)
    st.enter?.()
    demo.setSnap(false)
    prevActiveRef.current = active
    stRef.current = st
    restartRef.current = true // reset the per-step progress on the next frame
    return () => {
      scene.remove(st.group)
      disposeGroup(st.group)
      if (stRef.current === st) stRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, colorHex, container, step.action])

  // drive the station timeline + glide the sample, exactly like the demo's loop.
  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05)
    const st = stRef.current
    if (st) {
      // accumulate progress from CAPPED dt (the demo caps dt to 0.05) so a frame
      // stall can never skip the animation — it plays over ~STEP_DUR of frames.
      if (restartRef.current) {
        pRef.current = 0
        restartRef.current = false
      }
      pRef.current = Math.min(pRef.current + dt / STEP_DUR, 1)
      st.timeline?.(pRef.current)
      for (const u of st.updatables) u.userData?.update?.(dt)
    }
    const S = demo.getSample()
    if (S) {
      for (const v of S.vessels) {
        v.position.lerp(v.userData.tPos, 1 - Math.pow(0.02, dt))
        v.userData.update?.(dt)
      }
    }
  })

  // one step-driven floating label + the bench station number.
  const label = useMemo(() => demo.makeLabel(labelTitle, labelSub), [labelTitle, labelSub])
  useEffect(() => () => disposeGroup(label), [label])
  const decal = useMemo(() => demo.stationDecal(active + 1), [active])
  useEffect(() => () => disposeGroup(decal), [decal])

  return (
    <>
      <Lights />
      <Floor />
      <CameraRig view={view} />
      <primitive object={label} position={[0, 3.2, 0]} />
      <primitive object={decal} position={[0, 0.02, 2.2]} />
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
  transfer: 'Load column',
  wash: 'Wash',
  discard: 'Discard',
  elute: 'Elute',
  measure: 'Measure',
  generic: 'Step',
}
