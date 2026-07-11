// Pipette — a handheld micropipette that descends and releases drops (the demo's
// resident station pipette). Light-grey body, coloured plunger, disposable tip;
// when `pouring` it dips down and lets a drop fall from the tip. Self-animating
// from a boolean, no scene wiring.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MAT } from './materials.js'
import { theme } from '../theme.js'

export default function Pipette({
  pouring = false,
  color = theme.liquid.accent,
  restY = 1.6,
  ...props
}) {
  const group = useRef()
  const drop = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (group.current) {
      // gentle idle hover; dip lower while pouring
      const dip = pouring ? -0.35 + Math.sin(t * 2) * 0.05 : Math.sin(t * 1.4) * 0.05
      group.current.position.y = restY + dip
    }
    if (drop.current) {
      drop.current.visible = pouring
      if (pouring) {
        const yy = 1 - ((t * 1.6) % 1)
        drop.current.position.y = -0.95 - yy * 0.9
        drop.current.scale.setScalar(0.05 + (1 - yy) * 0.01)
      }
    }
  })

  return (
    <group ref={group} position={[0, restY, 0]} {...props}>
      {/* barrel */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.11, 0.13, 0.7, 24]} />
        <meshStandardMaterial {...MAT.shellLight} />
      </mesh>
      {/* plunger button (only coloured accent) */}
      <mesh position={[0, 0.98, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.14, 24]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
      </mesh>
      {/* finger hook */}
      <mesh position={[0.14, 0.55, 0]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.06, 0.28, 0.06]} />
        <meshStandardMaterial {...MAT.shellDark} />
      </mesh>
      {/* lower shaft */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 0.42, 20]} />
        <meshStandardMaterial {...MAT.shellLight} />
      </mesh>
      {/* disposable tip */}
      <mesh position={[0, -0.55, 0]}>
        <coneGeometry args={[0.075, 0.7, 24]} />
        <meshPhysicalMaterial color="#f4f8fb" roughness={0.25} transmission={0.4} thickness={0.2} transparent opacity={0.7} />
      </mesh>
      {/* fluid in the tip */}
      <mesh position={[0, -0.72, 0]}>
        <coneGeometry args={[0.045, 0.28, 20]} />
        <meshPhysicalMaterial color={color} roughness={0.3} emissive={color} emissiveIntensity={0.12} />
      </mesh>
      {/* falling drop */}
      <mesh ref={drop} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshPhysicalMaterial color={color} roughness={0.12} emissive={color} emissiveIntensity={0.1} clearcoat={0.8} />
      </mesh>
    </group>
  )
}
