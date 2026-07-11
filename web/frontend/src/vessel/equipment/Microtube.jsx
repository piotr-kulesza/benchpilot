// Microtube — the conical microcentrifuge tube with a ROUNDED BELL bottom (the
// demo's `buildTube`). Clear glass wall + rim, a frosted writing patch, a hinged
// cap, and liquid that conforms to the interior (fill prop). Pure presentational:
// no schema, no scene wiring — sane defaults, renders standalone.

import { useMemo } from 'react'
import { GLASS, liquidProps } from './materials.js'
import { TUBE_PROFILE, toPoints } from './profiles.js'
import { liquidPoints } from './liquid.js'
import { theme } from '../theme.js'

export default function Microtube({
  R = 0.34,
  H = 1.7,
  fill = 0.5,
  color = theme.liquid.accent,
  capColor = '#2b323b',
  cap = true,
  ...props
}) {
  const wall = useMemo(() => toPoints(TUBE_PROFILE, R, H), [R, H])
  const liquid = useMemo(
    () => (fill > 0.01 ? liquidPoints(TUBE_PROFILE, R, H, fill) : null),
    [R, H, fill],
  )

  return (
    <group {...props}>
      {/* glass wall */}
      <mesh castShadow>
        <latheGeometry args={[wall, 64]} />
        <meshPhysicalMaterial {...GLASS} side={2} depthWrite={false} />
      </mesh>
      {/* rim lip */}
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R * 1.02, 0.024, 12, 48]} />
        <meshPhysicalMaterial {...GLASS} side={2} depthWrite={false} />
      </mesh>
      {/* frosted writing patch moulded into the front wall */}
      <mesh position={[0, H * 0.6, 0]}>
        <cylinderGeometry args={[R * 0.965, R * 0.9, H * 0.3, 20, 1, true, Math.PI * 0.5 - 0.62, 1.24]} />
        <meshStandardMaterial color="#e9edf1" roughness={0.92} metalness={0} transparent opacity={0.82} side={2} />
      </mesh>
      {/* liquid, conforming to the tube interior */}
      {liquid && (
        <mesh>
          <latheGeometry args={[liquid, 48]} />
          <meshPhysicalMaterial {...liquidProps(color)} />
        </mesh>
      )}
      {/* hinged cap (open, flipped up over the rim) */}
      {cap && (
        <group position={[0, H + 0.06, 0]}>
          <mesh position={[0, 0.055, 0]}>
            <cylinderGeometry args={[R * 1.08, R * 1.05, 0.11, 40]} />
            <meshStandardMaterial color={capColor} roughness={0.62} metalness={0.03} />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <cylinderGeometry args={[R * 0.62, R * 1.02, 0.05, 40]} />
            <meshStandardMaterial color={capColor} roughness={0.62} metalness={0.03} />
          </mesh>
          <mesh position={[0, -0.06, 0]}>
            <cylinderGeometry args={[R * 0.9, R * 0.86, 0.14, 36]} />
            <meshStandardMaterial color={capColor} roughness={0.62} metalness={0.03} />
          </mesh>
          <mesh position={[-R * 1.05, 0, 0]}>
            <boxGeometry args={[0.05, 0.05, R * 0.5]} />
            <meshStandardMaterial color={capColor} roughness={0.62} metalness={0.03} />
          </mesh>
        </group>
      )}
    </group>
  )
}
