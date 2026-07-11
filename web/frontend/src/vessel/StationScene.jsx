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
import { reagentName, reagentVolume } from '../lib/runtime.js'
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

// the demo's LOOK.cinematic lights (verbatim values).
function Lights() {
  const L = demo.LOOK.cinematic
  return (
    <>
      <ambientLight color={L.amb.color} intensity={L.amb.int} />
      <hemisphereLight color={L.hemi.sky} groundColor={L.hemi.ground} intensity={L.hemi.int} />
      <directionalLight
        color={L.key.color}
        intensity={L.key.int}
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
      <directionalLight color={L.fill.color} intensity={L.fill.int} position={L.fill.pos} />
      <directionalLight color={L.aux.color} intensity={L.aux.int} position={L.aux.pos} />
    </>
  )
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[80, 40]} />
      <meshStandardMaterial color={0xcbc6bd} metalness={0.12} roughness={0.5} envMapIntensity={0.62} />
    </mesh>
  )
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
  const { action, equipment, container, color, name, vol, fill, seconds } = o
  const vessel = V_OF[container] || 'tube'
  const S = demo.getSample()
  const BT = demo.BLOCK_TOP

  // place the travelling sample at a seat, reset any leftover spin/tip
  const seat = (x, y, z, lvl = fill) => {
    S.only(vessel)
    const v = S[vessel]
    if (name) v.userData.setLabel(name, vol || '')
    v.userData.setColor(color)
    v.userData.setLevel(lvl)
    v.rotation.set(0, 0, 0)
    S.at(v, st.x + x, y, z)
    return v
  }

  if (action === 'pour_add') {
    // resident pipette rig + bottle; pipette pours over p, fill ramps at p>0.62.
    demo.stationReagent(st, BT, { key: 'r', blabel: '', color, vessel, vlabel: name || '', vsub: vol || '', cStart: null, cEnd: color, lStart: 0.1, lEnd: fill })
  } else if (action === 'pipette_mix') {
    // pipette aspirates + dispenses in repeated passes (reuse pipetteRun); ripple.
    demo.addPipetteRig(st)
    st.enter = () => { seat(0, BT, 0); demo.pipRest(st) }
    st.timeline = (p) => {
      const cp = (p * 3) % 1 // 3 mixing passes
      demo.pipetteRun(st, { x: 0, y: BT, z: 0 }, { x: 0, y: BT, z: 0 }, cp, { color, fill: 0.7 })
      S[vessel].userData.setLevel(fill + Math.sin(p * 26) * 0.02) // surface ripple
    }
  } else if (action === 'vortex_mix') {
    // the vessel visibly swirls + wobbles (this was the dead one).
    demo.addStand(st)
    st.enter = () => seat(0, BT, 0)
    st.timeline = (p) => {
      const v = S[vessel]
      v.rotation.y = p * 26 // many turns (monotonic)
      v.rotation.z = Math.sin(p * 46) * 0.14 // rapid wobble
    }
  } else if (action === 'discard') {
    // the vessel tips over a waste beaker and drains the flow-through.
    demo.addStand(st)
    const waste = demo.buildWaste()
    waste.position.set(1.3, 0, 0.6)
    waste.scale.setScalar(0.9)
    st.group.add(waste)
    st.updatables.push(waste)
    st.enter = () => seat(0, 0.7, 0, 0.5)
    st.timeline = (p) => {
      const e = demo.easeInOut(demo.clamp(p, 0, 1))
      const v = S[vessel]
      v.rotation.z = -e * 1.2 // tip toward the waste
      v.userData.setLevel(demo.lerp(0.5, 0.02, e)) // drain
    }
  } else if (equipment === 'centrifuge' || action === 'wash' || action === 'transfer' || action === 'elute') {
    // benchtop centrifuge, rotor spins over p (verbatim stationSpin).
    demo.stationSpin(st, BT, { vessel, vlabel: name || '', vsub: vol || '', color, lStart: 0.5, lEnd: action === 'wash' ? 0.1 : 0.45, cenLabel: 'Centrifuge', cenSub: vol || '', seconds })
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
      S[vessel].userData.setLevel(fill + Math.sin(p * 10) * 0.02)
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
      S[vessel].userData.setLevel(fill + Math.sin(p * 12) * 0.02)
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
    st.timeline = (p) => nano.userData.setProgress?.(demo.easeInOut(demo.clamp(p * 1.4, 0, 1)))
  } else {
    // generic actionable (rare) — a slow idle turn so it is never dead.
    demo.addStand(st)
    st.enter = () => seat(0, BT, 0)
    st.timeline = (p) => { S[vessel].rotation.y = p * 3 }
  }
  hideLabels(st.group)
}

function useContainers(steps) {
  return useMemo(() => sampleContainerSequence(steps.map((s) => s.action)), [steps])
}

export default function StationScene({ protocol, activeIndex = 0, lang = 'en', view = 'cinematic' }) {
  ensureMaps()
  const { gl, scene } = useThree()
  const steps = protocol?.steps || []
  const containers = useContainers(steps)
  const active = Math.max(0, Math.min(activeIndex, steps.length - 1))
  const step = steps[active] || { action: 'generic', reagents: [] }
  const { equipment } = resolveRecipe(step.action)
  const container = containers[active] || 'microtube'

  const primary = (step.reagents || []).find((r) => r.volume) || (step.reagents || [])[0]
  const primaryName = primary ? reagentName(primary, lang) : null
  const colorHex = useMemo(() => new Color(reagentColor(primaryName)).getHex(), [primaryName])
  const fill = resolveRecipe(step.action).anim.fill
  const vol = (primary && reagentVolume(primary, lang)) || ''
  const labelTitle = primaryName || ACTION_LABEL[step.action] || 'Step'
  const labelSub = vol || (step.spin?.rcf_min ? `≥ ${step.spin.rcf_min.toLocaleString()} ×g` : '')

  const stRef = useRef(null)
  const pRef = useRef(0)
  const restartRef = useRef(true)

  // one-time scene setup + the persistent travelling SAMPLE (added to the scene).
  useEffect(() => {
    demo.setRenderer(gl)
    demo.setScene(scene)
    ensureMaps()
    scene.environment = demo.buildEnvMap('cinematic')
    scene.background = demo.makeCineBackdrop()
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
    configureStation(st, { action: step.action, equipment, container, color: colorHex, name: labelTitle, vol, fill, seconds: step.duration_seconds })
    scene.add(st.group)
    // clear any leftover swirl/tip from the previous step's motion timeline.
    demo.getSample().vessels.forEach((v) => v.rotation.set(0, 0, 0))
    demo.setSnap(true)
    st.enter?.()
    demo.setSnap(false)
    stRef.current = st
    restartRef.current = true // reset the per-step progress on the next frame
    return () => {
      scene.remove(st.group)
      disposeGroup(st.group)
      if (stRef.current === st) stRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, colorHex, container])

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
