// ReagentBottle — the dressing bottle a reagent is added FROM (demo `buildBottle`).
// Wide glass body tapering to a narrow neck, conforming liquid, a coloured cap +
// neck ring that reagent-codes the bottle. Colour lives in the liquid and cap;
// the glass body stays neutral.

import { useMemo } from 'react'
import { liquidProps } from './materials.js'
import Glass from './Glass.jsx'
import { BOTTLE_PROFILE, toPoints } from './profiles.js'
import { liquidPoints } from './liquid.js'
import { theme } from '../theme.js'

export default function ReagentBottle({
  H = 1.3,
  R = 1,
  fill = 0.55,
  color = theme.liquid.accent,
  capColor = '#2b7f74',
  hero = false,
  ...props
}) {
  const body = useMemo(() => toPoints(BOTTLE_PROFILE, R, H), [R, H])
  const liquid = useMemo(
    () => (fill > 0.01 ? liquidPoints(BOTTLE_PROFILE, R, H, fill * 0.72) : null),
    [R, H, fill],
  )

  return (
    <group {...props}>
      <mesh castShadow>
        <latheGeometry args={[body, 72]} />
        <Glass hero={hero} />
      </mesh>
      {liquid && (
        <mesh>
          <latheGeometry args={[liquid, 64]} />
          <meshPhysicalMaterial {...liquidProps(color)} />
        </mesh>
      )}
      {/* screw cap + coloured neck seal */}
      <mesh position={[0, H + 0.11, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.22, 28]} />
        <meshStandardMaterial color={capColor} roughness={0.62} metalness={0.03} />
      </mesh>
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.155, 0.022, 12, 32]} />
        <meshStandardMaterial color={capColor} roughness={0.62} metalness={0.03} />
      </mesh>
    </group>
  )
}
