// Canvas wrapper for the dev harness — identical renderer settings to the runner's
// StationCanvas (LinearToneMapping, exposure 0.92, PCF soft shadows) so models and
// animations render in the exact shipping look.
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { GalleryScene } from './DevScene.jsx'
import { MatrixScene } from './MatrixScene.jsx'

export default function DevCanvas({ mode, item, angle, action, container, from, to, p }) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.LinearToneMapping
        gl.toneMappingExposure = 0.92
        gl.shadowMap.type = THREE.PCFSoftShadowMap
      }}
    >
      {mode === 'matrix'
        ? <MatrixScene action={action} container={container} from={from} to={to} p={p} />
        : <GalleryScene item={item} angle={angle} />}
    </Canvas>
  )
}
