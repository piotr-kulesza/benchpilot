// Gallery — a SCRATCH review route for the equipment/vessel component library.
// Not part of the runner: it mounts its own <Canvas> under the demo's studio
// lighting and lays every device + vessel out on a grid so each can be inspected
// in isolation (drag to orbit). Open with `?gallery=1`.
//
// Each cell self-animates via the component's own props (spin, pouring, heating,
// flow-through) or a looping progress fed to the timed devices.

import { Suspense, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, ContactShadows, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { theme } from '../theme.js'

import Microtube from './Microtube.jsx'
import EluateTube from './EluateTube.jsx'
import SpinColumn from './SpinColumn.jsx'
import ReagentBottle from './ReagentBottle.jsx'
import Pipette from './Pipette.jsx'
import Centrifuge from './Centrifuge.jsx'
import IncubationBlock from './IncubationBlock.jsx'
import HeatBlock from './HeatBlock.jsx'
import IceBucket from './IceBucket.jsx'
import Reader from './Reader.jsx'
import Bench from './Bench.jsx'

// studio lighting ported from Scene.jsx (dark neutral, one bright key)
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

// a looping 0..1 for the timed devices (incubation ring, reader gauge)
function useLoopingProgress(period = 6) {
  const [p, setP] = useState(0)
  useFrame((state) => setP((state.clock.elapsedTime % period) / period))
  return p
}

function TimedCell({ kind }) {
  const p = useLoopingProgress()
  return kind === 'incubation' ? (
    <IncubationBlock progress={p} scale={0.62} position={[0, -0.5, 0]} />
  ) : (
    <Reader progress={p} scale={0.6} position={[0, -0.5, 0]} />
  )
}

function Cell({ position, label, children }) {
  const g = useRef()
  useFrame((state) => {
    if (g.current) g.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.4
  })
  return (
    <group position={position}>
      <group ref={g}>{children}</group>
      <ContactShadows position={[0, -0.75, 0]} opacity={0.4} blur={2.4} far={2} scale={4} color={theme.shadow.color} resolution={256} />
      <Html position={[0, -0.95, 0]} center distanceFactor={9}>
        <div style={{ font: '600 13px system-ui', color: '#e9edf1', background: 'rgba(20,23,27,0.8)', padding: '3px 9px', borderRadius: 6, whiteSpace: 'nowrap' }}>{label}</div>
      </Html>
    </group>
  )
}

// grid layout: 4 columns, spaced; devices scaled to fit a ~2-unit cell
const COLS = 4
const DX = 3.4
const DZ = 3.4
function cellPos(i) {
  const c = i % COLS
  const r = Math.floor(i / COLS)
  return [(c - (COLS - 1) / 2) * DX, 0, r * DZ]
}

export default function Gallery() {
  const items = [
    { label: 'Microtube', el: <Microtube fill={0.55} color="#12a794" scale={0.7} position={[0, -0.7, 0]} /> },
    { label: 'EluateTube', el: <EluateTube fill={0.4} scale={0.85} position={[0, -0.6, 0]} /> },
    { label: 'SpinColumn (flow-through)', el: <SpinColumn fill={0.5} flowThrough color="#12a794" scale={0.7} position={[0, -0.85, 0]} /> },
    { label: 'ReagentBottle', el: <ReagentBottle fill={0.6} color="#9fd6ea" capColor="#2b7f74" scale={0.7} position={[0, -0.7, 0]} /> },
    { label: 'Pipette (pouring)', el: <Pipette pouring color="#12a794" scale={0.7} position={[0, -0.3, 0]} /> },
    { label: 'Centrifuge (spinning)', el: <Centrifuge spin={18} scale={0.42} position={[0, -0.75, 0]} /> },
    { label: 'IncubationBlock', el: <TimedCell kind="incubation" />, raw: true },
    { label: 'HeatBlock (heating)', el: <HeatBlock heating scale={0.62} position={[0, -0.6, 0]} /> },
    { label: 'IceBucket (frost)', el: <IceBucket frost scale={0.9} position={[0, -0.5, 0]} /> },
    { label: 'Reader (measuring)', el: <TimedCell kind="reader" />, raw: true },
    { label: 'Bench', el: <Bench position={[0, -0.7, 0]} /> },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: `radial-gradient(120% 100% at 50% 8%, ${theme.background.top}, ${theme.background.bottom})` }}>
      <div style={{ position: 'absolute', top: 14, left: 18, zIndex: 2, font: '600 15px system-ui', color: '#2b333a' }}>
        benchpilot — equipment & vessel library <span style={{ opacity: 0.55, fontWeight: 400 }}>· drag to orbit</span>
      </div>
      <Canvas
        dpr={[1, 2]}
        shadows
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 3.2, 11], fov: 34 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.LinearToneMapping
          gl.toneMappingExposure = 0.9
        }}
      >
        <Suspense fallback={null}>
          <Studio />
          <hemisphereLight intensity={0.25} groundColor="#20242a" />
          {items.map((it, i) => (
            <Cell key={it.label} position={cellPos(i)} label={it.label}>
              {it.el}
            </Cell>
          ))}
          <OrbitControls target={[0, 0, DZ / 2]} maxPolarAngle={Math.PI * 0.52} />
        </Suspense>
      </Canvas>
    </div>
  )
}
