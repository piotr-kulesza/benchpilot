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
import { FogExp2, Color, Vector3, Group } from 'three'
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

// device builders for the non-reagent / non-spin actions (bare-stand stations).
const DEVICE = {
  incubation_block: demo.buildColdBlock,
  heat_block: demo.buildColdBlock,
  ice_bucket: demo.buildIceBucket,
  reader: demo.buildNanoDrop,
}

// Build a station for a step — mapping the action to the demo's station kind.
function configureStation(st, o) {
  const { action, equipment, container, color, name, vol, fill, seconds } = o
  const vessel = V_OF[container] || 'tube'
  const S = demo.getSample()

  if (action === 'pour_add' || action === 'pipette_mix') {
    // reagent addition: resident pipette rig + bottle; pipette pours over p, fill
    // ramps at p>0.62 (verbatim stationReagent).
    demo.stationReagent(st, demo.BLOCK_TOP, {
      key: 'r',
      blabel: '',
      color,
      vessel,
      vlabel: name || '',
      vsub: vol || '',
      cStart: null,
      cEnd: color,
      lStart: 0.1,
      lEnd: fill,
    })
  } else if (equipment === 'centrifuge' || action === 'wash' || action === 'transfer' || action === 'elute') {
    // spin: benchtop centrifuge, rotor spins over p (verbatim stationSpin).
    demo.stationSpin(st, demo.BLOCK_TOP, {
      vessel,
      vlabel: name || '',
      vsub: vol || '',
      color,
      lStart: 0.5,
      lEnd: action === 'wash' ? 0.1 : 0.45,
      cenLabel: 'Centrifuge',
      cenSub: vol || '',
      seconds,
    })
  } else {
    // bare stand + the step's demo device (incubate/heat block, ice bucket,
    // NanoDrop) — same enter/timeline pattern as the demo's buildStation.
    demo.addStand(st)
    const make = DEVICE[equipment]
    let seatX = 0
    let seatY = 0
    let seatZ = 0
    if (make) {
      const dev = make()
      dev.position.set(0, 0, equipment === 'ice_bucket' ? 0.3 : 0)
      st.group.add(dev)
      st.updatables.push(dev)
      st.dev = dev
      if (equipment === 'incubation_block' || equipment === 'heat_block') seatY = demo.BLOCK_TOP
      else if (equipment === 'ice_bucket') { seatY = 0.34; seatZ = 0.3 }
      else if (equipment === 'reader') { seatX = -1.4; seatZ = 0.8 }
    }
    st.enter = () => {
      S.only(vessel)
      const v = S[vessel]
      if (name) v.userData.setLabel(name, vol || '')
      v.userData.setColor(color)
      v.userData.setLevel(fill)
      S.at(v, st.x + seatX, seatY, seatZ)
    }
    st.timeline = (p) => {
      st.dev?.userData.setProgress?.(demo.easeInOut(demo.clamp(p * 1.4, 0, 1)))
    }
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
