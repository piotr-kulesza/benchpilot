// SpinColumn — the RNeasy silica-membrane spin column seated in its collection
// tube (demo `buildSpinColumn`). Clear collection tube with a rounded U bottom,
// a frosted inner cup, a coloured membrane ring, and liquid in the cup. When
// `flowThrough` is set, buffer rinses through the membrane and pools below.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MAT, liquidProps, frostedProps } from './materials.js'
import Glass from './Glass.jsx'
import { COLUMN_COLLAR, COLUMN_CUP, rawPoints } from './profiles.js'
import { theme } from '../theme.js'

export default function SpinColumn({
  fill = 0.5,
  color = theme.liquid.accent,
  flowThrough = false,
  ...props
}) {
  const collar = useMemo(() => rawPoints(COLUMN_COLLAR), [])
  const cup = useMemo(() => rawPoints(COLUMN_CUP), [])
  const cupLiquid = useRef()
  const pool = useRef()

  useFrame((state) => {
    if (!flowThrough) return
    const t = state.clock.elapsedTime
    // buffer drains from the cup and collects in the collection tube below
    const drain = (Math.sin(t * 1.2 - Math.PI / 2) + 1) / 2 // 0→1→0
    if (cupLiquid.current) {
      const h = Math.max(0.02, (1 - drain) * fill * 0.5)
      cupLiquid.current.scale.y = h / 0.5
      cupLiquid.current.position.y = 0.92 + h / 2
      cupLiquid.current.visible = h > 0.03
    }
    if (pool.current) {
      const h = 0.04 + drain * 0.28
      pool.current.scale.y = h / 0.3
      pool.current.position.y = 0.04 + h / 2
      pool.current.visible = true
    }
  })

  return (
    <group {...props}>
      {/* collection tube (clear) + rim */}
      <mesh castShadow>
        <latheGeometry args={[collar, 96]} />
        <Glass />
      </mesh>
      <mesh position={[0, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.325, 0.02, 16, 64]} />
        <Glass />
      </mesh>
      {/* inner frosted cup + white flange */}
      <mesh>
        <latheGeometry args={[cup, 72]} />
        <meshPhysicalMaterial {...frostedProps()} side={2} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.29, 0.028, 12, 44]} />
        <meshStandardMaterial color="#e6ebf0" roughness={0.62} metalness={0.03} />
      </mesh>
      {/* silica membrane + pink retaining ring */}
      <mesh position={[0, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.19, 40]} />
        <meshStandardMaterial color="#f0dbe3" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.92, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.03, 14, 44]} />
        <meshStandardMaterial color="#e6b0c0" roughness={0.9} />
      </mesh>
      {/* liquid held on the membrane in the cup */}
      <mesh ref={cupLiquid} position={[0, 0.92 + fill * 0.25, 0]}>
        <cylinderGeometry args={[0.25, 0.22, fill * 0.5, 40]} />
        <meshPhysicalMaterial {...liquidProps(color)} />
      </mesh>
      {/* flow-through pooling in the collection tube */}
      <mesh ref={pool} position={[0, 0.1, 0]} visible={flowThrough}>
        <cylinderGeometry args={[0.28, 0.16, 0.3, 40]} />
        <meshPhysicalMaterial {...liquidProps(color)} opacity={0.85} transparent />
      </mesh>
    </group>
  )
}
