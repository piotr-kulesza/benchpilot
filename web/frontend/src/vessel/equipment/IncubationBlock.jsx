// IncubationBlock — anodized thermoblock with bored wells (demo `buildColdBlock`)
// plus a countdown PROGRESS RING that reads the step timer. Dark anodised body,
// brushed top, machined bevel frame; the ring is the only bright element and
// fills as `progress` (0..1) advances.

import { useMemo } from 'react'
import { MAT } from './materials.js'
import { theme } from '../theme.js'

export default function IncubationBlock({ progress = 0, ringColor = theme.accents.ring, ...props }) {
  const wells = useMemo(() => {
    const out = []
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) out.push([-0.7 + i * 0.7, -0.4 + j * 0.8])
    return out
  }, [])
  const arc = Math.max(0.0001, Math.min(1, progress)) * Math.PI * 2

  return (
    <group {...props}>
      {/* body */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.46, 0.12, 1.86]} />
        <meshStandardMaterial {...MAT.anodizedDark} />
      </mesh>
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.34, 0.32, 1.74]} />
        <meshStandardMaterial {...MAT.anodized} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.38, 0.06, 1.78]} />
        <meshStandardMaterial {...MAT.brushed} roughness={0.42} />
      </mesh>
      {/* machined bevel frame around the top edge */}
      {[
        { p: [0, 0.485, 0.9], s: [2.42, 0.028, 0.055] },
        { p: [0, 0.485, -0.9], s: [2.42, 0.028, 0.055] },
        { p: [1.2, 0.485, 0], s: [0.055, 0.028, 1.86] },
        { p: [-1.2, 0.485, 0], s: [0.055, 0.028, 1.86] },
      ].map((b, i) => (
        <mesh key={i} position={b.p}>
          <boxGeometry args={b.s} />
          <meshStandardMaterial {...MAT.bevel} />
        </mesh>
      ))}
      {/* bored wells + rims */}
      {wells.map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, 0.34, z]}>
            <cylinderGeometry args={[0.19, 0.19, 0.34, 24, 1, true]} />
            <meshStandardMaterial {...MAT.bore} side={2} />
          </mesh>
          <mesh position={[x, 0.18, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.19, 24]} />
            <meshStandardMaterial {...MAT.bore} />
          </mesh>
          <mesh position={[x, 0.48, z]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.19, 0.014, 10, 24]} />
            <meshStandardMaterial {...MAT.wellRim} />
          </mesh>
        </group>
      ))}
      {/* countdown progress ring hovering above the block */}
      <group position={[0, 1.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.55, 0.02, 12, 64]} />
          <meshStandardMaterial color="#5a636e" roughness={0.6} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.55, 0.035, 16, 80, arc]} />
          <meshStandardMaterial color={ringColor} emissive={ringColor} emissiveIntensity={0.7} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}
