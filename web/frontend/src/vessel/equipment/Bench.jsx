// Bench — the surface a plain (generic / vortex / transfer / discard) step rests
// on. A darker, gently reflective bench slab, matching the demo's grounded look;
// vessels sit on top of it. Purely presentational.

import { MAT } from './materials.js'

export default function Bench({
  size = [4, 3],
  color = '#6e685f',
  metalness = 0.14,
  roughness = 0.48,
  envMapIntensity = 0.55,
  ...props
}) {
  const [w, d] = size
  return (
    <group {...props}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} envMapIntensity={envMapIntensity} />
      </mesh>
      {/* a slim brushed-steel front edge lip so the slab reads with thickness */}
      <mesh position={[0, -0.03, d / 2 - 0.02]}>
        <boxGeometry args={[w, 0.06, 0.04]} />
        <meshStandardMaterial {...MAT.brushedDark} />
      </mesh>
    </group>
  )
}
