// StationScene — the schema-driven production line. Renders ANY parsed protocol
// as N stations along +X (one per step); `resolveRecipe(step.action)` picks each
// station's EQUIPMENT device, and the ONE travelling sample is seated INSIDE that
// device (rotor / well / bucket / column) — its container changing only at
// hand-off steps (transfer → column, elute → tube).
//
// The active station is the HERO: the whole line slides under a fixed, close
// camera so the active device is always centred and prominent (like the demo),
// rather than many small vessels spread thin. Cinematic = perspective, Isometric
// = orthographic; both frame the same centred station.
//
// This is the ONLY station module that pulls in three/equipment; it is wrapped by
// StationCanvas (the <Canvas>) which is itself lazy-loaded behind a WebGL guard.

import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, ContactShadows, PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import { EffectComposer, Bloom, DepthOfField, Vignette, N8AO } from '@react-three/postprocessing'
import { MathUtils, Vector3 } from 'three'
import { theme, reagentColor } from './theme.js'
import { resolveRecipe, sampleContainerSequence } from './sceneRecipe.js'
import { reagentName } from '../lib/runtime.js'

import Bench from './equipment/Bench.jsx'
import Centrifuge from './equipment/Centrifuge.jsx'
import IncubationBlock from './equipment/IncubationBlock.jsx'
import HeatBlock from './equipment/HeatBlock.jsx'
import IceBucket from './equipment/IceBucket.jsx'
import SpinColumn from './equipment/SpinColumn.jsx'
import ReagentBottle from './equipment/ReagentBottle.jsx'
import Pipette from './equipment/Pipette.jsx'
import Reader from './equipment/Reader.jsx'
import Microtube from './equipment/Microtube.jsx'
import EluateTube from './equipment/EluateTube.jsx'

const damp = MathUtils.damp

// ── line geometry (bench top is y = 0; devices + samples rest with base at 0)
const SPACING = 6.5
const stationX = (i) => i * SPACING

// ── cinematic (close perspective) framing — the active station fills the frame
const RAIL_Y = 1.55
const RAIL_Z = 6.6
const LOOK_Y = 0.7
// ── isometric (orthographic) framing
const ISO_DIR = new Vector3(1, 0.78, 1).normalize()
const ISO_DIST = 40
const ISO_LOOK_Y = 0.9

// Per-equipment DEVICE scale (tuned so the hero device reads ~2 units tall).
const DEVICE_SCALE = {
  centrifuge: 0.55,
  incubation_block: 0.68,
  heat_block: 0.7,
  ice_bucket: 1.0,
  reader: 0.66,
  spin_column: 0.9,
}

// Where the travelling sample sits, in the station's local frame (bench = y 0),
// so it reads as loaded INTO the device rather than floating above it.
const SEAT = {
  centrifuge: [0, 0.5, 0], // dipped into the rotor
  incubation_block: [0, 0.12, 0.27], // in a well bore
  heat_block: [0, 0.15, 0], // in the bath
  ice_bucket: [0, 0.05, 0], // among the ice
  reader: [0.25, 0, 0.75], // on the bench in front of the reader
  spin_column: [-1.0, 0, 0.15], // incoming tube beside the column (transfer hand-off)
  bottle_pipette: [0, 0, 0], // on the bench, under the pipette
  bench: [0, 0, 0], // on the bench
}
// Devices the sample sits INSIDE want a smaller vessel so it fits.
const SEATED_INSIDE = new Set(['centrifuge', 'incubation_block', 'heat_block', 'ice_bucket', 'spin_column'])

// ── dark neutral studio IBL: one bright key softbox + dark fills
function Studio() {
  const e = theme.env
  return (
    <Environment resolution={e.resolution}>
      <color attach="background" args={[e.base]} />
      <Lightformer form="rect" intensity={e.key.intensity} color={e.key.color} position={e.key.position} scale={e.key.scale} rotation={[-Math.PI / 2, 0, 0]} />
      <Lightformer form="rect" intensity={e.fillL.intensity} color={e.fillL.color} position={e.fillL.position} scale={e.fillL.scale} rotation={[0, Math.PI / 2, 0]} />
      <Lightformer form="rect" intensity={e.fillR.intensity} color={e.fillR.color} position={e.fillR.position} scale={e.fillR.scale} rotation={[0, -Math.PI / 2, 0]} />
      <Lightformer form="ring" intensity={e.rim.intensity} color={e.rim.color} position={e.rim.position} scale={e.rim.scale} />
    </Environment>
  )
}

// ── explicit lights on top of the IBL: low flat ambient/hemi + one strong key
function Lights() {
  const l = theme.lights
  return (
    <>
      <ambientLight color={l.ambient.color} intensity={l.ambient.intensity} />
      <hemisphereLight color={l.hemi.sky} groundColor={l.hemi.ground} intensity={l.hemi.intensity} />
      <directionalLight
        color={l.key.color}
        intensity={l.key.intensity}
        position={l.key.position}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={44}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
      />
      <directionalLight color={l.fill.color} intensity={l.fill.intensity} position={l.fill.position} />
      <directionalLight color={l.aux.color} intensity={l.aux.intensity} position={l.aux.position} />
    </>
  )
}

// One-time HSL saturation boost over object materials — coloured liquids/caps/
// accents pop; neutrals barely move (low sat × factor stays low). Skips
// MeshBasicMaterial (backdrops). Runs after each commit so stations that mount on
// navigation get boosted too; a per-material flag keeps it idempotent.
function SaturationPass({ factor = theme.saturation }) {
  const { scene } = useThree()
  useLayoutEffect(() => {
    const hsl = {}
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m || !m.color || m.isMeshBasicMaterial || m.userData._sat) continue
        m.userData._sat = true
        m.color.getHSL(hsl)
        if (hsl.s > 0.05) m.color.setHSL(hsl.h, Math.min(1, hsl.s * factor), hsl.l)
      }
    })
  })
  return null
}

// Filmic postprocessing — AO grounds crevices, bloom lifts only highlights, DOF
// focuses the centred active station, vignette settles the edges. Knobs: theme.post.
function Post() {
  const p = theme.post
  const dofTarget = useMemo(() => new Vector3(...p.dof.target), [p.dof.target])
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={p.ao.aoRadius} intensity={p.ao.intensity} distanceFalloff={p.ao.distanceFalloff} color={p.ao.color} halfRes={p.ao.halfRes} />
      <Bloom intensity={p.bloom.intensity} luminanceThreshold={p.bloom.luminanceThreshold} luminanceSmoothing={p.bloom.luminanceSmoothing} mipmapBlur={p.bloom.mipmapBlur} />
      <DepthOfField target={dofTarget} focalLength={p.dof.focalLength} bokehScale={p.dof.bokehScale} focusRange={p.dof.focusRange} />
      <Vignette eskil={false} offset={p.vignette.offset} darkness={p.vignette.darkness} />
    </EffectComposer>
  )
}

// The equipment device for a station (no sample; that is placed by the caller).
// `hero` (active station only) upgrades its glass to true transmission.
function Equipment({ step, progress, running, hero }) {
  const { equipment } = resolveRecipe(step.action)
  const scale = DEVICE_SCALE[equipment] || 1
  switch (equipment) {
    case 'centrifuge':
      return <Centrifuge spin={running ? 18 : 5} scale={scale} />
    case 'incubation_block':
      return <IncubationBlock progress={progress} scale={scale} />
    case 'heat_block':
      return <HeatBlock heating scale={scale} />
    case 'ice_bucket':
      return <IceBucket frost scale={scale} />
    case 'reader':
      return <Reader progress={progress} scale={scale} />
    case 'spin_column':
      return <SpinColumn flowThrough={step.action === 'wash' || step.action === 'elute'} color={theme.liquid.accent} scale={scale} hero={hero} />
    case 'bottle_pipette':
      return (
        <group>
          <ReagentBottle position={[1.25, 0, 0.35]} scale={0.7} />
          <Pipette position={[0, 2.0, 0]} pouring scale={0.7} />
        </group>
      )
    default:
      return null // bench — the slab already grounds the step
  }
}

// The single travelling sample vessel (its container is decided by the walk). It
// is the HERO glass — full transmission — since it is always the active subject.
function Sample({ container, color, fill, scale, hero = true }) {
  switch (container) {
    case 'spin_column':
      return <SpinColumn fill={fill} color={color} scale={scale ?? 0.75} hero={hero} />
    case 'eluate_tube':
      return <EluateTube fill={fill} color={color} scale={scale ?? 0.9} hero={hero} />
    default:
      return <Microtube fill={fill} color={color} scale={scale ?? 0.62} hero={hero} />
  }
}

// The sample's container as each step begins (microtube → column → eluate tube),
// changing only at hand-offs. Pure logic lives in sceneRecipe.js.
function useContainers(steps) {
  return useMemo(() => sampleContainerSequence(steps.map((s) => s.action)), [steps])
}

// The whole line lives inside this group, translated so the ACTIVE station sits at
// world origin (the camera's focus). Damped, so Next glides the line rather than
// snapping — that is what reads as the sample travelling down the bench.
function MovingWorld({ offsetX, children }) {
  const g = useRef()
  const cur = useRef(-offsetX)
  useFrame((_, dt) => {
    if (!g.current) return
    cur.current = damp(cur.current, -offsetX, 4, Math.min(dt, 1 / 30))
    g.current.position.x = cur.current
  })
  return (
    <group ref={g} position-x={-offsetX}>
      {children}
    </group>
  )
}

// Fixed cameras framing the centred station; the world moves, not the camera.
function CameraRig({ view }) {
  const persp = useRef()
  const ortho = useRef()
  useFrame(() => {
    if (view === 'isometric') ortho.current?.lookAt(0, ISO_LOOK_Y, 0)
    else persp.current?.lookAt(0, LOOK_Y, 0)
  })
  return (
    <>
      <PerspectiveCamera ref={persp} makeDefault={view !== 'isometric'} fov={34} position={[0, RAIL_Y, RAIL_Z]} />
      <OrthographicCamera ref={ortho} makeDefault={view === 'isometric'} zoom={64} near={0.1} far={200} position={[ISO_DIR.x * ISO_DIST, ISO_LOOK_Y + ISO_DIR.y * ISO_DIST, ISO_DIR.z * ISO_DIST]} />
    </>
  )
}

export default function StationScene({ protocol, activeIndex = 0, answers = {}, lang = 'en', progress = 1, running = false, view = 'cinematic' }) {
  const steps = protocol?.steps || []
  const containers = useContainers(steps)
  const active = Math.max(0, Math.min(activeIndex, steps.length - 1))
  const step = steps[active] || { action: 'generic', reagents: [] }
  const { equipment } = resolveRecipe(step.action)
  const container = containers[active] || 'microtube'

  // active-step sample colour + fill (from its primary reagent + the anim)
  const primary = (step.reagents || []).find((r) => r.volume) || (step.reagents || [])[0]
  const color = reagentColor(primary ? reagentName(primary, lang) : null)
  const fill = resolveRecipe(step.action).anim.fill

  // The travelling sample is suppressed only when the equipment device IS the
  // sample's container (a spin column showing itself — wash / elute). At a
  // `transfer` the container is still a microtube, so we DO show it, handing off
  // beside the column.
  const suppressSample = equipment === 'spin_column' && container === 'spin_column'
  const seat = SEAT[equipment] || SEAT.bench
  const sampleScale = SEATED_INSIDE.has(equipment) ? 0.5 : undefined

  const lineMid = ((steps.length - 1) * SPACING) / 2
  const lineWidth = Math.max(6, steps.length * SPACING) + SPACING

  // a small window of stations so neighbours slide through frame as you navigate
  const window = []
  for (let d = -1; d <= 1; d++) {
    const i = active + d
    if (i >= 0 && i < steps.length) window.push(i)
  }

  return (
    <>
      <fogExp2 attach="fog" args={[theme.fog.color, theme.fog.density]} />
      <Studio />
      <Lights />
      <SaturationPass />
      <CameraRig view={view} />

      <MovingWorld offsetX={stationX(active)}>
        {/* the bench spanning the whole line, top at y = 0 */}
        <group position={[lineMid, 0, 0]}>
          <Bench size={[lineWidth, 5]} color={theme.bench.color} />
        </group>

        {/* per-station equipment (only the active window is mounted) */}
        {window.map((i) => (
          <group key={i} position={[stationX(i), 0, 0]}>
            <Equipment step={steps[i]} progress={i === active ? progress : 1} running={i === active ? running : false} hero={i === active} />
          </group>
        ))}

        {/* the single travelling sample, seated in the active device */}
        {!suppressSample && (
          <group position={[stationX(active) + seat[0], seat[1], seat[2]]}>
            <Sample container={container} color={color} fill={fill} scale={sampleScale} />
          </group>
        )}

        <ContactShadows position={[stationX(active), 0.001, 0]} opacity={0.33} blur={2.6} far={3} scale={5} color={theme.shadow.color} resolution={512} />
      </MovingWorld>

      <Post />
    </>
  )
}
