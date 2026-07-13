// Lazy-loaded <Canvas> wrapper for the station line. Like Canvas3D, this is a
// module that pulls in the heavy 3D libs, kept behind the WebGL guard in
// StationView so the runner never needs a GPU to load.

import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import StationScene from './StationScene.jsx'

export default function StationCanvas({ protocol, activeIndex, answers, lang, timerRef, altByStep, chromeless }) {
  return (
    <Canvas
      // Cap the pixel ratio at 1.5: on a retina display dpr=2 renders 4× the pixels
      // (2880×1800 for a 1440×900 canvas) for no visible benefit on a stylised, fog-soft
      // scene — capping to 1.5 cuts ~44% of the fill-rate cost. The single cheapest win.
      dpr={[1, 1.5]}
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
        timerRef={timerRef}
        altByStep={altByStep}
        chromeless={chromeless}
      />
    </Canvas>
  )
}
