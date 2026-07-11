// Centrifuge — benchtop microcentrifuge with a domed clear lid and a spinning
// fixed-angle rotor (demo `buildCentrifuge`). Realistic light-grey shell; the
// only colour is a slim status LED + start button. `spin` sets the rotor speed
// (rad/s target); the lid lifts open when the rotor is at rest.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, Vector3, Quaternion } from 'three'
import { MAT } from './materials.js'

const damp = MathUtils.damp
const easeInOut = (t) => {
  t = MathUtils.clamp(t, 0, 1)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export default function Centrifuge({ spin = 0, ...props }) {
  const rotor = useRef()
  const lidPivot = useRef()
  const st = useRef({ spin: 0, lid: 0 }).current

  // 8 fixed-angle rotor slots, each tilted outward by the same angle
  const slots = useMemo(
    () =>
      Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2
        const axis = new Vector3(-Math.sin(a), 0, Math.cos(a))
        const q = new Quaternion().setFromAxisAngle(axis, -0.4)
        return { pos: [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62], quat: [q.x, q.y, q.z, q.w] }
      }),
    [],
  )

  useFrame((state, dt) => {
    dt = Math.min(dt, 1 / 30)
    st.spin = damp(st.spin, spin, 3, dt)
    if (rotor.current) rotor.current.rotation.y += st.spin * dt
    const wantOpen = st.spin < 1.2 ? 1 : 0
    st.lid = damp(st.lid, wantOpen, 3, dt)
    if (lidPivot.current) lidPivot.current.rotation.x = -easeInOut(st.lid) * 1.15
  })

  return (
    <group {...props}>
      {/* base stack */}
      <mesh position={[0, 0.09, 0]} receiveShadow>
        <cylinderGeometry args={[1.5, 1.58, 0.18, 56]} />
        <meshStandardMaterial {...MAT.brushedDark} />
      </mesh>
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.35, 1.5, 0.62, 56]} />
        <meshStandardMaterial {...MAT.brushedDark} />
      </mesh>
      {/* cooling vents */}
      {Array.from({ length: 20 }, (_, v) => {
        const a = (v / 20) * Math.PI * 2
        return (
          <mesh key={v} position={[Math.cos(a) * 1.4, 0.4, Math.sin(a) * 1.4]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.045, 0.24, 0.03]} />
            <meshStandardMaterial {...MAT.cavity} />
          </mesh>
        )
      })}
      {/* upper shell + rings */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[1.25, 1.3, 0.5, 56]} />
        <meshStandardMaterial {...MAT.shellLight} />
      </mesh>
      <mesh position={[0, 1.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.24, 0.05, 16, 60]} />
        <meshStandardMaterial {...MAT.shellDark} />
      </mesh>
      {/* dark bowl the rotor sits in */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[1.15, 1.0, 0.5, 48, 1, true]} />
        <meshStandardMaterial {...MAT.cavity} side={2} />
      </mesh>

      {/* rotor */}
      <group ref={rotor} position={[0, 1.08, 0]}>
        <mesh>
          <cylinderGeometry args={[0.32, 0.4, 0.34, 32]} />
          <meshStandardMaterial {...MAT.brushed} />
        </mesh>
        <mesh position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.95, 0.85, 0.12, 44]} />
          <meshStandardMaterial {...MAT.brushed} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.12, 0.14, 0.12, 6]} />
          <meshStandardMaterial {...MAT.brushedDark} />
        </mesh>
        {slots.map((s, k) => (
          <group key={k} position={s.pos} quaternion={s.quat}>
            <mesh>
              <cylinderGeometry args={[0.11, 0.09, 0.62, 20, 1, true]} />
              <meshStandardMaterial color="#252d37" metalness={0.5} roughness={0.5} side={2} />
            </mesh>
          </group>
        ))}
      </group>

      {/* clear domed lid on a rear pivot */}
      <group ref={lidPivot} position={[0, 1.16, -1.2]}>
        <mesh position={[0, 0, 1.2]}>
          <sphereGeometry args={[1.22, 44, 30, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshPhysicalMaterial color="#282d36" roughness={0.12} transmission={0.6} thickness={0.4} clearcoat={1} clearcoatRoughness={0.08} transparent opacity={0.5} side={2} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.01, 1.2]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.2, 0.045, 14, 60]} />
          <meshStandardMaterial {...MAT.brushedDark} />
        </mesh>
        <mesh position={[0, 0.6, 2.2]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.16, 0.03, 12, 24, Math.PI]} />
          <meshStandardMaterial {...MAT.plasticDark} />
        </mesh>
      </group>

      {/* front fascia readout + accents (the only colour) */}
      <mesh position={[0, 0.62, 1.29]} rotation={[-0.32, 0, 0]}>
        <boxGeometry args={[0.72, 0.4, 0.05]} />
        <meshStandardMaterial {...MAT.shellDark} />
      </mesh>
      <mesh position={[0, 0.62, 1.315]} rotation={[-0.32, 0, 0]}>
        <planeGeometry args={[0.6, 0.3]} />
        <meshStandardMaterial color="#12161c" emissive="#1c5c4e" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[-0.42, 0.62, 1.3]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshStandardMaterial color="#3ad884" emissive="#2fbf6f" emissiveIntensity={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0.42, 0.62, 1.3]} rotation={[Math.PI / 2 - 0.32, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.05, 24]} />
        <meshStandardMaterial color="#3f7fd0" emissive="#2f6fd0" emissiveIntensity={0.7} roughness={0.42} metalness={0.15} />
      </mesh>
    </group>
  )
}
