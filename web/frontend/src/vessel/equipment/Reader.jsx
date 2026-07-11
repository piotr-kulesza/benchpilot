// Reader — a NanoDrop-style micro-volume spectrophotometer (demo `buildNanoDrop`)
// for the QC / measure step. Light-grey body with a hinged sampling arm, a
// pedestal, a screen, and a small readout GAUGE that fills with `progress`. The
// only colour is the teal trim, green power LED and blue sample button.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils } from 'three'
import { MAT } from './materials.js'
import { theme } from '../theme.js'

export default function Reader({ progress = 1, ...props }) {
  const gauge = useRef()
  useFrame(() => {
    if (gauge.current) {
      // pulse the readout emissive so it reads as "acquiring"
      gauge.current.material.emissiveIntensity = 0.4 + 0.3 * Math.min(1, progress)
    }
  })
  const arc = Math.max(0.0001, MathUtils.clamp(progress, 0, 1)) * Math.PI * 1.5

  return (
    <group {...props}>
      {/* base + deck */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[1.7, 0.1, 1.3]} />
        <meshStandardMaterial {...MAT.shellDark} />
      </mesh>
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.58, 0.44, 1.18]} />
        <meshStandardMaterial {...MAT.shellDark} />
      </mesh>
      <mesh position={[0, 0.56, 0]}>
        <boxGeometry args={[1.5, 0.05, 1.1]} />
        <meshStandardMaterial {...MAT.shellDark} />
      </mesh>
      {/* upright arm + hinged sampling head */}
      <mesh position={[-0.5, 1.05, 0]}>
        <boxGeometry args={[0.42, 1.05, 0.52]} />
        <meshStandardMaterial {...MAT.shellLight} />
      </mesh>
      <group position={[-0.32, 1.5, 0]} rotation={[0, 0, 0.12]}>
        <mesh position={[0.34, -0.02, 0]}>
          <boxGeometry args={[0.82, 0.34, 0.56]} />
          <meshStandardMaterial {...MAT.shellDark} />
        </mesh>
      </group>
      {/* measurement pedestal (where the drop goes) */}
      <mesh position={[0.15, 0.6, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 0.1, 26]} />
        <meshStandardMaterial {...MAT.brushed} />
      </mesh>
      {/* screen + frame */}
      <mesh position={[0.55, 1.0, 0.58]}>
        <boxGeometry args={[1.25, 0.9, 0.06]} />
        <meshStandardMaterial color="#2a2f36" roughness={0.5} />
      </mesh>
      <mesh position={[0.55, 1.0, 0.615]}>
        <planeGeometry args={[1.12, 0.76]} />
        <meshStandardMaterial color="#141b22" emissive="#1c3a44" emissiveIntensity={0.3} />
      </mesh>
      {/* readout gauge — fills with progress */}
      <group position={[0.55, 1.0, 0.62]} rotation={[0, 0, Math.PI * 0.75]}>
        <mesh>
          <torusGeometry args={[0.26, 0.015, 12, 48, Math.PI * 1.5]} />
          <meshStandardMaterial color="#3a444e" roughness={0.6} />
        </mesh>
        <mesh ref={gauge}>
          <torusGeometry args={[0.26, 0.03, 14, 60, arc]} />
          <meshStandardMaterial color={theme.accents.ring} emissive={theme.accents.ring} emissiveIntensity={0.5} toneMapped={false} />
        </mesh>
      </group>
      {/* colour accents */}
      <mesh position={[0, 0.55, 0.6]}>
        <boxGeometry args={[1.4, 0.04, 0.04]} />
        <meshStandardMaterial color="#2fa898" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-0.6, 0.4, 0.6]}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshStandardMaterial color="#3ad884" emissive="#2fbf6f" emissiveIntensity={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[-0.35, 0.585, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.05, 22]} />
        <meshStandardMaterial color="#3f7fd0" emissive="#1f4f8f" emissiveIntensity={0.25} roughness={0.42} metalness={0.15} />
      </mesh>
    </group>
  )
}
