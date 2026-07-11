// IceBucket — open stainless tub holding a bed of translucent ice (demo
// `buildIceBucket`), for keep-on-ice / cold steps. Neutral steel body; a blue
// inner liner and translucent cubes read as cold. `frost` adds a cold point-light
// cast around it.

import { useMemo } from 'react'
import { MAT } from './materials.js'
import { theme } from '../theme.js'

export default function IceBucket({ frost = true, ...props }) {
  const cubes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + (i % 3)
        const rr = 0.16 + ((i * 7) % 10) / 10 * 0.42
        return {
          pos: [Math.cos(a) * rr, 0.1 + ((i * 3) % 5) / 5 * 0.14, Math.sin(a) * rr],
          rot: [i, i * 1.3, i * 0.7],
          s: 0.13 + ((i * 5) % 6) / 6 * 0.08,
        }
      }),
    [],
  )

  return (
    <group {...props}>
      {/* steel tub wall + rim */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.74, 0.62, 0.6, 44, 1, true]} />
        <meshStandardMaterial {...MAT.steel} side={2} />
      </mesh>
      <mesh position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.74, 0.03, 14, 48]} />
        <meshStandardMaterial {...MAT.brushedDark} />
      </mesh>
      {/* blue inner liner + floor */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.7, 0.58, 0.6, 44, 1, true]} />
        <meshStandardMaterial color="#3f86bf" metalness={0.25} roughness={0.5} side={2} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.58, 44]} />
        <meshStandardMaterial color="#3f86bf" metalness={0.25} roughness={0.5} />
      </mesh>
      {/* bed of translucent ice cubes */}
      {cubes.map((c, i) => (
        <mesh key={i} position={c.pos} rotation={c.rot}>
          <boxGeometry args={[c.s, c.s, c.s]} />
          <meshPhysicalMaterial color="#d4e2ea" roughness={0.14} transmission={0.7} thickness={0.4} clearcoat={0.8} transparent opacity={0.6} flatShading />
        </mesh>
      ))}
      {/* cold cast */}
      <pointLight color={theme.accents.cold} position={[0, 1.1, 0.6]} intensity={frost ? 1.8 : 0} distance={4} />
    </group>
  )
}
