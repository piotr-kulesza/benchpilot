// StationScene — the schema-driven production line. Renders ANY parsed protocol
// as N stations along +X (one per step); `resolveRecipe(step.action)` picks each
// station's equipment + vessel. ONE travelling sample glides down the line, its
// container changing only at hand-off steps (transfer → column, elute → tube).
// The camera dollies (cinematic) or pans (isometric) to the active station.
//
// This is the ONLY station module that pulls in three/equipment; it is wrapped by
// StationCanvas (the <Canvas>) which is itself lazy-loaded behind a WebGL guard.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer, ContactShadows, PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
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

// ── line geometry
const SPACING = 6
const stationX = (i) => i * SPACING

// ── cinematic (perspective dolly) framing
const RAIL_Y = 1.7
const RAIL_Z = 9
const LOOK_Y = 0.75
// ── isometric (orthographic pan) framing
const ISO_DIR = new Vector3(1, 0.82, 1).normalize()
const ISO_DIST = 40
const ISO_LOOK_Y = 1.1

// Where the travelling sample sits relative to its station, per equipment — so it
// reads as loaded INTO the device (rotor / well / bucket) rather than floating.
// (offsets account for each device's own scale below, so the sample reads as
//  seated in the rotor / well / bucket rather than floating above it.)
const SAMPLE_ANCHOR = {
  centrifuge: [0, 0.55, 0.3],
  incubation_block: [0, 0.28, 0],
  heat_block: [0, 0.3, 0],
  ice_bucket: [0, 0.2, 0],
  reader: [0.55, 0.22, 0.1],
  bottle_pipette: [0, 0, 0],
  bench: [0, 0, 0],
}

// ── studio lighting (dark neutral, one key) — art direction is tuned in Stage 4
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

// The equipment device for a station (no sample; that lives at scene level).
function Equipment({ step, progress, running }) {
  const recipe = resolveRecipe(step.action)
  switch (recipe.equipment) {
    case 'centrifuge':
      return <Centrifuge spin={running ? 18 : 5} scale={0.5} />
    case 'incubation_block':
      return <IncubationBlock progress={progress} scale={0.68} />
    case 'heat_block':
      return <HeatBlock heating scale={0.7} />
    case 'ice_bucket':
      return <IceBucket frost scale={1} />
    case 'reader':
      return <Reader progress={progress} scale={0.66} />
    case 'spin_column':
      return <SpinColumn flowThrough={step.action === 'wash'} color={theme.liquid.accent} scale={0.85} />
    case 'bottle_pipette':
      return (
        <group>
          <ReagentBottle position={[1.1, 0, 0.2]} scale={0.7} />
          <Pipette position={[0, 1.7, 0]} pouring scale={0.7} />
        </group>
      )
    default:
      return null // bench — the slab already grounds the step
  }
}

// The single travelling sample vessel (its container is decided by the walk below).
function Sample({ container, color, fill }) {
  switch (container) {
    case 'spin_column':
      return <SpinColumn fill={fill} color={color} scale={0.7} />
    case 'eluate_tube':
      return <EluateTube fill={fill} color={color} scale={0.85} />
    default:
      return <Microtube fill={fill} color={color} scale={0.62} />
  }
}

// The sample's container as each step begins (microtube → column → eluate tube),
// changing only at hand-offs. Pure logic lives in sceneRecipe.js.
function useContainers(steps) {
  return useMemo(() => sampleContainerSequence(steps.map((s) => s.action)), [steps])
}

function CameraRig({ view, targetX }) {
  const persp = useRef()
  const ortho = useRef()
  const rail = useRef(targetX)
  useFrame((state, dt) => {
    dt = Math.min(dt, 1 / 30)
    rail.current = damp(rail.current, targetX, 3, dt)
    const t = state.clock.elapsedTime
    if (view === 'isometric' && ortho.current) {
      const rx = rail.current
      ortho.current.position.set(rx + ISO_DIR.x * ISO_DIST, ISO_LOOK_Y + ISO_DIR.y * ISO_DIST, ISO_DIR.z * ISO_DIST)
      ortho.current.up.set(0, 1, 0)
      ortho.current.lookAt(rx, ISO_LOOK_Y, 0)
    } else if (persp.current) {
      const rx = rail.current + Math.sin(t * 0.15) * 0.12
      persp.current.position.set(rx, RAIL_Y, RAIL_Z)
      persp.current.lookAt(rx, LOOK_Y, 0)
    }
  })
  return (
    <>
      <PerspectiveCamera ref={persp} makeDefault={view !== 'isometric'} fov={32} position={[targetX, RAIL_Y, RAIL_Z]} />
      <OrthographicCamera ref={ortho} makeDefault={view === 'isometric'} zoom={58} near={0.1} far={200} position={[targetX + ISO_DIR.x * ISO_DIST, ISO_LOOK_Y + ISO_DIR.y * ISO_DIST, ISO_DIR.z * ISO_DIST]} />
    </>
  )
}

// The travelling sample, damped along X so a Next glides rather than teleports.
function TravellingSample({ targetX, container, color, fill, anchor }) {
  const g = useRef()
  const x = useRef(targetX)
  useFrame((_, dt) => {
    if (!g.current) return
    x.current = damp(x.current, targetX, 5, Math.min(dt, 1 / 30))
    g.current.position.x = x.current + anchor[0]
  })
  return (
    <group ref={g} position={[targetX + anchor[0], anchor[1], anchor[2]]}>
      <Sample container={container} color={color} fill={fill} />
    </group>
  )
}

export default function StationScene({ protocol, activeIndex = 0, answers = {}, lang = 'en', progress = 1, running = false, view = 'cinematic' }) {
  const steps = protocol?.steps || []
  const containers = useContainers(steps)
  const active = Math.max(0, Math.min(activeIndex, steps.length - 1))
  const step = steps[active] || { action: 'generic', reagents: [] }
  const recipe = resolveRecipe(step.action)

  // active-step sample colour + fill (from its primary reagent + the anim)
  const primary = (step.reagents || []).find((r) => r.volume) || (step.reagents || [])[0]
  const color = reagentColor(primary ? reagentName(primary, lang) : null)
  const fill = recipe.anim.fill
  const anchor = SAMPLE_ANCHOR[recipe.equipment] || SAMPLE_ANCHOR.bench

  // one long bench under the whole line
  const lineWidth = Math.max(6, steps.length * SPACING)
  const lineMid = ((steps.length - 1) * SPACING) / 2

  // render a small window of stations so the LINE of devices reads as the camera
  // travels, while only the active station carries the (single) travelling sample
  const window = []
  for (let d = -1; d <= 1; d++) {
    const i = active + d
    if (i >= 0 && i < steps.length) window.push(i)
  }

  return (
    <>
      <Studio />
      <CameraRig view={view} targetX={stationX(active)} />

      {/* the bench spanning the line */}
      <group position={[lineMid, -0.75, 0]}>
        <Bench size={[lineWidth + SPACING, 5]} />
      </group>

      {/* per-station equipment for the active window (per-step visibility) */}
      {window.map((i) => (
        <group key={i} position={[stationX(i), -0.75, 0]}>
          <Equipment
            step={steps[i]}
            progress={i === active ? progress : 1}
            running={i === active ? running : false}
          />
        </group>
      ))}

      {/* the single travelling sample — suppressed when the equipment IS the
          sample's container (a spin column shows itself) */}
      {recipe.equipment !== 'spin_column' && (
        <group position={[0, -0.75, 0]}>
          <TravellingSample targetX={stationX(active)} container={containers[active]} color={color} fill={fill} anchor={anchor} />
        </group>
      )}

      <ContactShadows position={[stationX(active), -0.74, 0]} opacity={0.4} blur={2.4} far={2.5} scale={6} color={theme.shadow.color} resolution={512} />
    </>
  )
}
