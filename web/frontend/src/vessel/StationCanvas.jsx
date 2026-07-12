// Lazy-loaded <Canvas> wrapper for the station line. Like Canvas3D, this is a
// module that pulls in the heavy 3D libs, kept behind the WebGL guard in
// StationView so the runner never needs a GPU to load.

import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import StationScene from './StationScene.jsx'

export default function StationCanvas({ protocol, activeIndex, answers, lang, progress, running, hasTimer, done, view, altByStep }) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      // alpha:false — the demo's scene.background (makeCineBackdrop) fills the
      // frame, exactly as the HTML demo (renderer alpha:false).
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        // the demo's renderer settings, verbatim: LinearToneMapping @ 0.78 +
        // PCF soft shadows.
        gl.toneMapping = THREE.LinearToneMapping
        gl.toneMappingExposure = 0.92
        gl.shadowMap.type = THREE.PCFSoftShadowMap
      }}
    >
      <StationScene
        protocol={protocol}
        activeIndex={activeIndex}
        answers={answers}
        lang={lang}
        progress={progress}
        running={running}
        hasTimer={hasTimer}
        done={done}
        view={view}
        altByStep={altByStep}
      />
    </Canvas>
  )
}
