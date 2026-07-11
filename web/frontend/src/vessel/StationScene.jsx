// StationScene — mounts the DEMO's real THREE.Group builders (demoScene.js,
// lifted verbatim from demos/neutrophil-rna-extraction.html) via <primitive>, and
// runs each group's own userData.update(dt) hook. There is ZERO hand-written
// geometry / material / animation here: every model, material, light, env,
// background, label and decal comes from the demo's code.
//
// What stays on our side (the parts that actually generalise across protocols):
//   • resolveRecipe(step.action) → which builder to mount for the active step
//   • the travelling sample + container hand-offs (microtube → column → eluate)
//   • the camera rig (cinematic / isometric) + navigation
//   • driving each group's own setters (setSpin / setProgress / setLevel / …)

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import { FogExp2, Color, Vector3 } from 'three'
import { reagentColor } from './theme.js'
import { resolveRecipe, sampleContainerSequence } from './sceneRecipe.js'
import { reagentName, reagentVolume } from '../lib/runtime.js'
import * as demo from '../scene/demoScene.js'

// ── the demo's cinematic camera (RAIL_Y/RAIL_Z/LOOK_Y) + isometric framing
const FOV = 40
const RAIL_Y = 3.35
const RAIL_Z = 9.6
const LOOK_Y = 1.05
const ISO_DIR = new Vector3(1, 0.82, 1).normalize()
const ISO_DIST = 90
const ISO_LOOK_Y = 1.35
const VIEW_SIZE = 7.6

// build the demo's shared PBR texture maps ONCE, before any builder runs (its
// materials read TEX). Called synchronously in render so children see it filled.
let _maps = false
function ensureMaps() {
  if (!_maps) {
    demo.buildSharedMaps()
    _maps = true
  }
}

// dispose a built group's GPU resources on unmount (each step rebuilds).
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
    if (o.isSprite && o.material?.map) o.material.map.dispose()
  })
}

// ── scene-level setup from the demo: env map, background, fog, exposure.
function DemoStage() {
  const { gl, scene } = useThree()
  useEffect(() => {
    demo.setRenderer(gl)
    ensureMaps()
    scene.environment = demo.buildEnvMap('cinematic')
    scene.background = demo.makeCineBackdrop()
    const f = demo.LOOK.cinematic.fog
    scene.fog = new FogExp2(f.color, f.density)
    return () => {
      scene.environment = null
      scene.background = null
      scene.fog = null
    }
  }, [gl, scene])
  return null
}

// ── the demo's LOOK.cinematic lights (verbatim values).
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

// the bench floor — the demo's cinematic bench colour/material (applyViewMode).
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[80, 40]} />
      <meshStandardMaterial color={0xcbc6bd} metalness={0.12} roughness={0.5} envMapIntensity={0.62} />
    </mesh>
  )
}

// fixed cameras framing the active station (centred at world origin).
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
      <OrthographicCamera
        ref={ortho}
        makeDefault={view === 'isometric'}
        near={0.1}
        far={400}
        zoom={zoom}
        position={[ISO_DIR.x * ISO_DIST, ISO_LOOK_Y + ISO_DIR.y * ISO_DIST, ISO_DIR.z * ISO_DIST]}
      />
    </>
  )
}

// Mount a demo builder group, run its update(dt), and drive its setters each frame.
// The builders each ship their OWN floating label; we hide it and show a single
// step-driven label instead (see <primitive object={label}> below).
function Builder({ make, drive, position, scale }) {
  const group = useMemo(() => {
    const g = make()
    if (g.userData.label) g.userData.label.visible = false
    return g
  }, [make])
  useFrame((_, dt) => {
    drive?.(group)
    group.userData.update?.(Math.min(dt, 1 / 30))
  })
  useEffect(() => () => disposeGroup(group), [group])
  return <primitive object={group} position={position || [0, 0, 0]} scale={scale ?? 1} />
}

// equipment key → demo builder (the demo has no heat-block; reuse the cold block).
const DEVICE = {
  centrifuge: demo.buildCentrifuge,
  incubation_block: demo.buildColdBlock,
  heat_block: demo.buildColdBlock,
  ice_bucket: demo.buildIceBucket,
  reader: demo.buildNanoDrop,
}

// where the travelling sample sits, per equipment (demo-scale, bench = y 0).
const SEAT = {
  centrifuge: [0, 0.72, 0],
  incubation_block: [0, 0.5, 0],
  heat_block: [0, 0.5, 0],
  ice_bucket: [0, 0.12, 0],
  reader: [1.15, 0, 0.5],
  bottle_pipette: [0, 0, 0],
  bench: [0, 0, 0],
}

// build the travelling sample group for a container (demo buildTube/buildSpinColumn).
function makeSample(container) {
  if (container === 'spin_column') return demo.buildSpinColumn()
  if (container === 'eluate_tube')
    return demo.buildTube({ height: 1.15, radius: 0.26, color: demo.COL.rna, label: 'Eluate', sub: 'RNA', capColor: 0x49b26a })
  return demo.buildTube({ height: 1.7, radius: 0.32, color: demo.COL.pellet, label: 'Sample', sub: '', cold: true, capColor: 0x3f7fd0 })
}

function useContainers(steps) {
  return useMemo(() => sampleContainerSequence(steps.map((s) => s.action)), [steps])
}

export default function StationScene({ protocol, activeIndex = 0, answers = {}, lang = 'en', progress = 1, running = false, view = 'cinematic' }) {
  ensureMaps()
  const steps = protocol?.steps || []
  const containers = useContainers(steps)
  const active = Math.max(0, Math.min(activeIndex, steps.length - 1))
  const step = steps[active] || { action: 'generic', reagents: [] }
  const { equipment } = resolveRecipe(step.action)
  const container = containers[active] || 'microtube'

  // sample colour (demo COL palette via reagentColor) + fill + label text
  const primary = (step.reagents || []).find((r) => r.volume) || (step.reagents || [])[0]
  const primaryName = primary ? reagentName(primary, lang) : null
  const colorHex = useMemo(() => new Color(reagentColor(primaryName)).getHex(), [primaryName])
  const fill = resolveRecipe(step.action).anim.fill
  const labelTitle = primaryName || ACTION_LABEL[step.action] || 'Step'
  const labelSub = (primary && reagentVolume(primary, lang)) || (step.spin?.rcf_min ? `≥ ${step.spin.rcf_min.toLocaleString()} ×g` : '')

  // the equipment device IS the sample when it's a spin column (wash/elute)
  const deviceIsSample = equipment === 'spin_column'
  const deviceMake = DEVICE[equipment]
  const seat = SEAT[equipment] || SEAT.bench

  const driveSample = (g) => {
    g.userData.setColor?.(colorHex)
    g.userData.setLevel?.(fill)
  }
  const driveDevice = (g) => {
    g.userData.setSpin?.(running ? 20 : 9) // centrifuge
    g.userData.setProgress?.(progress) // nanodrop
  }

  // rebuild the label / decal / sample per step (keyed values)
  const label = useMemo(() => demo.makeLabel(labelTitle, labelSub), [labelTitle, labelSub])
  useEffect(() => () => disposeGroup(label), [label])
  const decal = useMemo(() => demo.stationDecal(active + 1), [active])
  useEffect(() => () => disposeGroup(decal), [decal])
  const sampleMake = useMemo(() => () => makeSample(container), [container])
  const bottleColor = reagentColor(primaryName)
  const bottleMake = useMemo(() => () => demo.buildBottle(bottleColor, '', 1.3, 0x2b7f74), [bottleColor])

  return (
    <>
      <DemoStage />
      <Lights />
      <CameraRig view={view} />
      <Floor />

      {/* resident blue pipette stand + a pipette docked in its cradles (permanent
          bench props, right side) */}
      <Builder make={demo.buildPipetteStand} position={[3.6, 0, 0.6]} />
      <Builder make={demo.buildPipette} drive={(g) => g.userData.setFluid?.(0.4)} position={[3.6, 0.05, 0.6]} />

      {/* active equipment device */}
      {deviceMake && <Builder make={deviceMake} drive={driveDevice} position={[0, 0, 0]} />}

      {/* pour step: the reagent bottle beside the sample */}
      {equipment === 'bottle_pipette' && <Builder make={bottleMake} position={[1.9, 0, 0.5]} />}

      {/* the travelling sample (its own container). When the device IS the
          sample (spin column), that single group is both. */}
      {deviceIsSample ? (
        <Builder make={demo.buildSpinColumn} drive={driveSample} position={[0, 0, 0]} />
      ) : (
        <Builder make={sampleMake} drive={driveSample} position={seat} />
      )}

      {/* 3D label above the hero + bench station number */}
      <primitive object={label} position={[0, 3.0, 0]} />
      <primitive object={decal} position={[0, 0.02, 2.0]} />
    </>
  )
}

// English fallback title for the 3D label when a step has no reagent.
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
