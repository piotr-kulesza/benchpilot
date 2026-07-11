// Pipette — a detailed handheld micropipette, ported from the demo's buildPipette:
// a white body (lathe), a dark accent band + finger hook, a knurled volume dial
// with a digit window, a plunger + button, an ejector arm, a steel cone and a
// translucent disposable tip. When `pouring` it dips and releases a drop.
//
// Parts sit at the demo's local Y (tip at ~-0.86, button at ~2.5); the scene
// positions/scales the whole thing via props. The dip animation runs on an inner
// group so it never fights the scene's position.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector2 } from 'three'
import { MAT } from './materials.js'
import { theme } from '../theme.js'

// demo materials
const BODY = { color: '#d8dee6', metalness: 0.15, roughness: 0.42, envMapIntensity: 1.1 }
const ACCENT = { color: '#4c6470', metalness: 0.3, roughness: 0.44, envMapIntensity: 0.8 }
const DARK = { color: '#232a33', metalness: 0.05, roughness: 0.5, envMapIntensity: 0.8 }

const V = (x, y) => new Vector2(x, y)

export default function Pipette({ pouring = false, color = theme.liquid.accent, ...props }) {
  const anim = useRef()
  const drop = useRef()
  const bodyPts = useMemo(
    () => [V(0.0, 0.55), V(0.135, 0.55), V(0.152, 0.85), V(0.15, 1.35), V(0.128, 1.7), V(0.11, 2.0), V(0.108, 2.05)],
    [],
  )
  const tipPts = useMemo(
    () => [V(0.0, -0.86), V(0.014, -0.8), V(0.05, -0.2), V(0.08, 0.02), V(0.11, 0.02), V(0.115, -0.03)],
    [],
  )

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (anim.current) anim.current.position.y = pouring ? -0.35 + Math.sin(t * 2) * 0.05 : Math.sin(t * 1.4) * 0.04
    if (drop.current) {
      drop.current.visible = pouring
      if (pouring) {
        const yy = 1 - ((t * 1.6) % 1)
        drop.current.position.y = -0.9 - yy * 0.9
        drop.current.scale.setScalar(0.035 + (1 - yy) * 0.008)
      }
    }
  })

  return (
    <group {...props}>
      <group ref={anim}>
        {/* white moulded body */}
        <mesh castShadow>
          <latheGeometry args={[bodyPts, 48]} />
          <meshStandardMaterial {...BODY} />
        </mesh>
        {/* dark accent band + finger hook */}
        <mesh position={[0, 0.95, 0]}>
          <cylinderGeometry args={[0.155, 0.14, 0.34, 40]} />
          <meshStandardMaterial {...ACCENT} />
        </mesh>
        <mesh position={[0, 1.25, 0.12]} rotation={[1.2, 0, 0]}>
          <torusGeometry args={[0.12, 0.032, 14, 28, Math.PI * 1.2]} />
          <meshStandardMaterial {...ACCENT} />
        </mesh>
        {/* volume window (dark) */}
        <mesh position={[0, 1.05, 0.14]} rotation={[-0.05, 0, 0]}>
          <boxGeometry args={[0.13, 0.2, 0.04]} />
          <meshStandardMaterial {...DARK} />
        </mesh>
        {/* knurled volume dial + accent rims */}
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.148, 0.148, 0.26, 30]} />
          <meshStandardMaterial {...MAT.brushed} color="#8a94a0" />
        </mesh>
        <mesh position={[0, 1.63, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.15, 0.013, 10, 30]} />
          <meshStandardMaterial {...ACCENT} />
        </mesh>
        <mesh position={[0, 1.37, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.15, 0.013, 10, 30]} />
          <meshStandardMaterial {...ACCENT} />
        </mesh>
        {/* upper shaft + plunger + button */}
        <mesh position={[0, 2.22, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.34, 22]} />
          <meshStandardMaterial {...MAT.brushed} />
        </mesh>
        <mesh position={[0, 2.45, 0]}>
          <cylinderGeometry args={[0.115, 0.1, 0.14, 28]} />
          <meshStandardMaterial {...ACCENT} />
        </mesh>
        <mesh position={[0, 2.5, 0]}>
          <sphereGeometry args={[0.11, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          <meshStandardMaterial {...MAT.rubber} color="#2a323c" />
        </mesh>
        {/* ejector collar + button + arm */}
        <mesh position={[0, 2.02, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.1, 28]} />
          <meshStandardMaterial {...DARK} />
        </mesh>
        <mesh position={[0.14, 2.1, 0]}>
          <boxGeometry args={[0.07, 0.16, 0.09]} />
          <meshStandardMaterial {...ACCENT} />
        </mesh>
        <mesh position={[0.135, 1.25, 0]}>
          <boxGeometry args={[0.035, 1.5, 0.05]} />
          <meshStandardMaterial {...MAT.brushed} />
        </mesh>
        {/* stem + steel cone */}
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.055, 0.04, 0.5, 24]} />
          <meshStandardMaterial {...BODY} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.04, 0.028, 0.16, 24]} />
          <meshStandardMaterial {...MAT.brushed} />
        </mesh>
        {/* translucent disposable tip */}
        <mesh castShadow>
          <latheGeometry args={[tipPts, 32]} />
          <meshStandardMaterial color="#e6eef4" roughness={0.4} metalness={0} transparent opacity={0.5} side={2} />
        </mesh>
        {/* fluid held in the tip */}
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.02, 0.6, 20]} />
          <meshStandardMaterial color={color} roughness={0.32} emissive={color} emissiveIntensity={0.08} />
        </mesh>
        {/* falling drop */}
        <mesh ref={drop} visible={false}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial color={color} roughness={0.2} emissive={color} emissiveIntensity={0.12} />
        </mesh>
      </group>
    </group>
  )
}
