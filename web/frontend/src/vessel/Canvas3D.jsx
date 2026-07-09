// Lazy-loaded so three.js / R3F only enter the bundle when 3D actually renders.
// This is the ONLY module that pulls in the heavy 3D libraries.

import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Scene from './Scene.jsx'
import { theme } from './theme.js'

export default function Canvas3D({ behavior, liquidColor, progress, running, temp }) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      camera={{ position: theme.camera.position, fov: theme.camera.fov }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.06
      }}
      shadows
    >
      <Scene behavior={behavior} liquidColor={liquidColor} progress={progress} running={running} temp={temp} />
    </Canvas>
  )
}
