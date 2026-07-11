// EluateTube — the clean collection tube the purified sample spins into at the
// elute hand-off (demo: buildTube {height:1.15, radius:0.26}, green cap, "RNA").
// Same rounded-bell tube silhouette as Microtube, smaller and cleaner (no
// graduation print), with a green cap to read as the final eluate.

import { useMemo } from 'react'
import { liquidProps } from './materials.js'
import Glass from './Glass.jsx'
import { TUBE_PROFILE, toPoints } from './profiles.js'
import { liquidPoints, innerRadiusAt } from './liquid.js'

export default function EluateTube({
  R = 0.26,
  H = 1.15,
  fill = 0.3,
  color = '#12c46c', // fresh RNA green
  capColor = '#49b26a',
  cap = true,
  hero = false,
  ...props
}) {
  const wall = useMemo(() => toPoints(TUBE_PROFILE, R, H), [R, H])
  const liquid = useMemo(
    () => (fill > 0.01 ? liquidPoints(TUBE_PROFILE, R, H, fill) : null),
    [R, H, fill],
  )
  const topY = fill * H
  const topR = innerRadiusAt(TUBE_PROFILE, R, H, topY)

  return (
    <group {...props}>
      <mesh castShadow>
        <latheGeometry args={[wall, 96]} />
        <Glass hero={hero} />
      </mesh>
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R * 1.02, 0.02, 16, 64]} />
        <Glass hero={hero} />
      </mesh>
      {liquid && (
        <>
          <mesh>
            <latheGeometry args={[liquid, 64]} />
            <meshPhysicalMaterial {...liquidProps(color)} emissiveIntensity={0.2} />
          </mesh>
          <mesh position={[0, topY, 0]} scale={[topR, topR * 0.14, topR]}>
            <sphereGeometry args={[1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial {...liquidProps(color)} emissiveIntensity={0.2} />
          </mesh>
        </>
      )}
      {cap && (
        <group position={[0, H + 0.05, 0]}>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[R * 1.08, R * 1.05, 0.1, 36]} />
            <meshStandardMaterial color={capColor} roughness={0.55} metalness={0.03} />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <cylinderGeometry args={[R * 0.9, R * 0.86, 0.12, 32]} />
            <meshStandardMaterial color={capColor} roughness={0.55} metalness={0.03} />
          </mesh>
        </group>
      )}
    </group>
  )
}
