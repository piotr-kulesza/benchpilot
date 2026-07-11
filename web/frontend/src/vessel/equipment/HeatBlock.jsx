// HeatBlock — a dry heat block / water bath (heat-shock station). Same anodized
// body language as the incubation block, but its central bath shows RISING
// BUBBLES and a WARM GLOW when `heating`. Colour comes only from the warm cast,
// not the shell.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D } from 'three'
import { MAT } from './materials.js'
import { theme } from '../theme.js'

const N = 14

export default function HeatBlock({ heating = true, ...props }) {
  const bubbles = useRef()
  const warm = useRef()
  const dummy = useMemo(() => new Object3D(), [])
  const seed = useMemo(
    () =>
      Array.from({ length: N }, () => ({
        x: (Math.random() - 0.5) * 0.5,
        z: (Math.random() - 0.5) * 0.5,
        p: Math.random(),
        s: 0.4 + Math.random() * 0.7,
        sp: 0.25 + Math.random() * 0.3,
      })),
    [],
  )

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (bubbles.current) {
      bubbles.current.visible = heating
      if (heating) {
        seed.forEach((b, i) => {
          const yy = (b.p + t * b.sp) % 1
          const y = 0.5 + yy * 0.5
          dummy.position.set(b.x + Math.sin(t * 3 + i) * 0.02, y, b.z)
          dummy.scale.setScalar((0.025 + b.s * 0.02) * (0.5 + yy))
          dummy.updateMatrix()
          bubbles.current.setMatrixAt(i, dummy.matrix)
        })
        bubbles.current.instanceMatrix.needsUpdate = true
      }
    }
    if (warm.current) {
      warm.current.intensity = heating ? 2.6 * (0.8 + Math.sin(t * 4) * 0.2) : 0
    }
  })

  return (
    <group {...props}>
      {/* body */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.12, 1.6]} />
        <meshStandardMaterial {...MAT.anodizedDark} />
      </mesh>
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.78, 0.34, 1.48]} />
        <meshStandardMaterial {...MAT.anodized} />
      </mesh>
      <mesh position={[0, 0.46, 0]}>
        <boxGeometry args={[1.82, 0.06, 1.52]} />
        <meshStandardMaterial {...MAT.brushed} roughness={0.44} />
      </mesh>
      {/* central bath well */}
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.5, 0.48, 0.4, 40, 1, true]} />
        <meshStandardMaterial {...MAT.bore} side={2} />
      </mesh>
      {/* water surface, warm-tinted + emissive */}
      <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 40]} />
        <meshStandardMaterial color="#7fb4c4" roughness={0.2} emissive={theme.accents.warm} emissiveIntensity={heating ? 0.28 : 0.05} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0.49, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.02, 12, 40]} />
        <meshStandardMaterial {...MAT.wellRim} />
      </mesh>
      {/* rising bubbles */}
      <instancedMesh ref={bubbles} args={[undefined, undefined, N]} visible={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshPhysicalMaterial color="#ffffff" transmission={0.9} thickness={0.1} roughness={0.05} transparent opacity={0.55} />
      </instancedMesh>
      {/* warm accent glow */}
      <pointLight ref={warm} color={theme.accents.warm} position={[0, 0.9, 0.4]} intensity={0} distance={4} />
    </group>
  )
}
