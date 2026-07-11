// Lazy-loaded <Canvas> wrapper for the station line. Like Canvas3D, this is a
// module that pulls in the heavy 3D libs, kept behind the WebGL guard in
// StationView so the runner never needs a GPU to load.

import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import StationScene from './StationScene.jsx'

export default function StationCanvas({ protocol, activeIndex, answers, lang, progress, running, view }) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        // LINEAR, not ACES/Cineon: filmic tone maps desaturate bright surfaces
        // toward white — the core washed-out, low-contrast bug. Linear keeps full
        // saturation AND honours exposure, so a low exposure darkens the whole
        // frame for real shadow-to-highlight contrast. (See the demo, verbatim.)
        gl.toneMapping = THREE.LinearToneMapping
        gl.toneMappingExposure = 0.78
      }}
    >
      <StationScene
        protocol={protocol}
        activeIndex={activeIndex}
        answers={answers}
        lang={lang}
        progress={progress}
        running={running}
        view={view}
      />
    </Canvas>
  )
}
