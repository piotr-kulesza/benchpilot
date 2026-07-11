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
import { Environment, Lightformer, ContactShadows, PerspectiveCamera, OrthographicCamera, Float } from '@react-three/drei'
import { MathUtils, Vector3, CanvasTexture, SRGBColorSpace } from 'three'
import { theme, reagentColor } from './theme.js'
import { resolveRecipe, sampleContainerSequence } from './sceneRecipe.js'
import { reagentName, reagentVolume } from '../lib/runtime.js'

import Bench from './equipment/Bench.jsx'
import Centrifuge from './equipment/Centrifuge.jsx'
import IncubationBlock from './equipment/IncubationBlock.jsx'
import HeatBlock from './equipment/HeatBlock.jsx'
import IceBucket from './equipment/IceBucket.jsx'
import SpinColumn from './equipment/SpinColumn.jsx'
import ReagentBottle from './equipment/ReagentBottle.jsx'
import Pipette from './equipment/Pipette.jsx'
import PipetteStand from './equipment/PipetteStand.jsx'
import Reader from './equipment/Reader.jsx'
import Microtube from './equipment/Microtube.jsx'
import EluateTube from './equipment/EluateTube.jsx'

const damp = MathUtils.damp
const easeOut = (t) => 1 - Math.pow(1 - MathUtils.clamp(t, 0, 1), 3)

// ── line geometry (bench top is y = 0; devices + samples rest with base at 0)
const SPACING = 6.5
const stationX = (i) => i * SPACING

// ── cinematic (close perspective) framing — CLOSE, so the hero device dominates
// ~60–70% of the frame. HERO_BIAS_X shifts the framing left so the centred hero
// sits in the open right area, clear of the left step panel.
const RAIL_Y = 1.25
const RAIL_Z = 4.8
const LOOK_Y = 0.95
const FOV = 38
// small leftward framing bias so the compact left panel doesn't cover the hero —
// NOT enough to shove it to the right edge (was 1.4, which did exactly that).
const HERO_BIAS_X = 0.5
const INTRO_SECONDS = 1.5 // one-time reveal dolly on mount
// ── isometric (orthographic) framing — zoomed up to match the enlarged hero
const ISO_DIR = new Vector3(1, 0.78, 1).normalize()
const ISO_DIST = 40
const ISO_LOOK_Y = 0.85
const ISO_ZOOM = 84

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

// English action labels for the 3D chip when a step has no reagent to name.
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

// ── floating 3D label above the hero (the demo's makeLabel): a dark rounded card
// with a title + teal sub, drawn to a canvas and billboarded as a sprite.
function labelTexture(title, sub) {
  const W = 512
  const H = 168
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const x = 12
  const y = 28
  const w = W - 24
  const h = 104
  const r = 16
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
  g.fillStyle = 'rgba(20,23,27,0.82)'
  g.fill()
  g.lineWidth = 1.5
  g.strokeStyle = 'rgba(150,160,175,0.3)'
  g.stroke()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#e9edf1'
  g.font = "600 44px -apple-system, 'Helvetica Neue', Arial"
  g.fillText(title, W / 2, sub ? y + 40 : y + h / 2)
  if (sub) {
    g.font = "500 30px -apple-system, 'Helvetica Neue', Arial"
    g.fillStyle = '#8fcabf'
    g.fillText(sub, W / 2, y + 78)
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function Label3D({ title, sub, position }) {
  const tex = useMemo(() => (title ? labelTexture(title, sub) : null), [title, sub])
  if (!tex) return null
  return (
    <sprite position={position} scale={[1.95, 0.64, 1]} renderOrder={999}>
      <spriteMaterial map={tex} transparent depthTest={false} depthWrite={false} />
    </sprite>
  )
}

// ── bench station number embossed on the surface (the demo's stationDecal).
function decalTexture(n) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(150,164,180,0.5)'
  g.font = "300 74px 'Helvetica Neue', Arial"
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillText(`0${n}`.slice(-2), 12, 70)
  g.strokeStyle = 'rgba(95,179,166,0.55)'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(14, 104)
  g.lineTo(150, 104)
  g.stroke()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

function StationDecal({ n, position }) {
  const tex = useMemo(() => decalTexture(n), [n])
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.7, 0.85]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  )
}

// The equipment device for a station (no sample; that is placed by the caller).
function Equipment({ step, progress, running }) {
  const { equipment } = resolveRecipe(step.action)
  const scale = DEVICE_SCALE[equipment] || 1
  switch (equipment) {
    case 'centrifuge':
      // the active centrifuge always visibly spins; faster while its timer runs
      return <Centrifuge spin={running ? 22 : 13} scale={scale} />
    case 'incubation_block':
      return <IncubationBlock progress={progress} scale={scale} />
    case 'heat_block':
      return <HeatBlock heating scale={scale} />
    case 'ice_bucket':
      return <IceBucket frost scale={scale} />
    case 'reader':
      return <Reader progress={progress} scale={scale} />
    case 'spin_column':
      return <SpinColumn flowThrough={step.action === 'wash' || step.action === 'elute'} color={theme.liquid.accent} scale={scale} />
    case 'bottle_pipette':
      // pipette tilted like a hand holding it: tip in the tube (world x≈0), body
      // angled up-left so it clears the top HUD bar AND sits beside the 3D label
      // (which is centred above the vessel) rather than behind it.
      return (
        <group>
          <ReagentBottle position={[1.1, 0, 0.35]} scale={0.7} />
          <Pipette position={[-0.2, 1.25, 0.15]} rotation={[0, 0, 0.55]} pouring scale={0.48} />
        </group>
      )
    default:
      return null // bench — the slab already grounds the step
  }
}

// The single travelling sample vessel (its container is decided by the walk).
// `anim` (the active step's behavior descriptor) drives its per-action motion.
function Sample({ container, color, fill, scale, anim = null }) {
  switch (container) {
    case 'spin_column':
      return <SpinColumn fill={fill} color={color} scale={scale ?? 0.75} />
    case 'eluate_tube':
      return <EluateTube fill={fill} color={color} scale={scale ?? 0.9} />
    default:
      return <Microtube fill={fill} color={color} scale={scale ?? 0.62} anim={anim} />
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
// On mount the perspective camera plays a one-time reveal dolly (pulls in + up).
function CameraRig({ view }) {
  const persp = useRef()
  const ortho = useRef()
  const start = useRef(null)
  useFrame((state) => {
    if (view === 'isometric') {
      ortho.current?.lookAt(-HERO_BIAS_X, ISO_LOOK_Y, 0)
      return
    }
    if (!persp.current) return
    if (start.current === null) start.current = state.clock.elapsedTime
    const e = easeOut((state.clock.elapsedTime - start.current) / INTRO_SECONDS)
    const back = 1 - e // 1 at start → 0 settled
    persp.current.position.set(-HERO_BIAS_X, RAIL_Y - back * 0.6, RAIL_Z + back * 3.0)
    persp.current.lookAt(-HERO_BIAS_X, LOOK_Y - back * 0.12, 0)
  })
  return (
    <>
      <PerspectiveCamera ref={persp} makeDefault={view !== 'isometric'} fov={FOV} position={[-HERO_BIAS_X, RAIL_Y, RAIL_Z]} />
      <OrthographicCamera ref={ortho} makeDefault={view === 'isometric'} zoom={ISO_ZOOM} near={0.1} far={200} position={[-HERO_BIAS_X + ISO_DIR.x * ISO_DIST, ISO_LOOK_Y + ISO_DIR.y * ISO_DIST, ISO_DIR.z * ISO_DIST]} />
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

  // active-step sample colour + fill + motion descriptor
  const primary = (step.reagents || []).find((r) => r.volume) || (step.reagents || [])[0]
  const primaryName = primary ? reagentName(primary, lang) : null
  const color = reagentColor(primaryName)
  const anim = resolveRecipe(step.action).anim
  const fill = anim.fill

  // 3D floating label text (title + sub), driven by the step's reagent
  const labelTitle = primaryName || ACTION_LABEL[step.action] || 'Step'
  const labelSub =
    (primary && reagentVolume(primary, lang)) ||
    (step.spin?.rcf_min ? `≥ ${step.spin.rcf_min.toLocaleString()} ×g` : '')

  // The travelling sample is suppressed only when the equipment device IS the
  // sample's container (a spin column showing itself — wash / elute). At a
  // `transfer` the container is still a microtube, so we DO show it, handing off
  // beside the column.
  const suppressSample = equipment === 'spin_column' && container === 'spin_column'
  const seat = SEAT[equipment] || SEAT.bench
  const sampleScale = SEATED_INSIDE.has(equipment) ? 0.5 : undefined
  // a free-standing IDLE sample gets a gentle bob; one that actively moves
  // (vortex swirl/shake, discard tip) or sits inside a device stays put so the
  // action animation reads cleanly.
  const floatable = (equipment === 'bench' || equipment === 'bottle_pipette') && !anim.swirl && !anim.shake && !anim.tip

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

      {/* permanent blue pipette stand — a resident bench prop on the OPEN RIGHT
          side (the left is covered by the step panel), base flat on the bench.
          x=1.5 keeps its rightmost (~1.87) inside the visible right edge (~2.14
          at a 1.6 aspect) with margin, and clearly right of the hero (world 0). */}
      <PipetteStand position={[1.5, 0, 0.1]} scale={0.52} />

      {/* floating 3D label just above the active vessel + bench station number.
          Fixed frame, since the active station sits at world origin. y=1.9 sits
          ~21% from the top (clear of the top HUD; y=2.5 was ~3% → clipped). */}
      <Label3D title={labelTitle} sub={labelSub} position={[0, 1.9, 0]} />
      <StationDecal n={active + 1} position={[0, 0.014, 0.6]} />


      <MovingWorld offsetX={stationX(active)}>
        {/* the bench spanning the whole line, top at y = 0 */}
        <group position={[lineMid, 0, 0]}>
          <Bench size={[lineWidth, 5]} color={theme.bench.color} />
        </group>

        {/* per-station equipment (only the active window is mounted) */}
        {window.map((i) => (
          <group key={i} position={[stationX(i), 0, 0]}>
            <Equipment step={steps[i]} progress={i === active ? progress : 1} running={i === active ? running : false} />
          </group>
        ))}

        {/* the single travelling sample, seated in the active device */}
        {!suppressSample && (
          <group position={[stationX(active) + seat[0], seat[1], seat[2]]}>
            {floatable ? (
              <Float speed={1.1} rotationIntensity={0.15} floatIntensity={0.35} floatingRange={[0, 0.06]}>
                <Sample container={container} color={color} fill={fill} scale={sampleScale} anim={anim} />
              </Float>
            ) : (
              <Sample container={container} color={color} fill={fill} scale={sampleScale} anim={anim} />
            )}
          </group>
        )}

        <ContactShadows position={[stationX(active), 0.001, 0]} opacity={0.33} blur={2.6} far={3} scale={5} color={theme.shadow.color} resolution={512} />
      </MovingWorld>
    </>
  )
}
