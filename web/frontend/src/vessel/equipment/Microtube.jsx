// Microtube — the conical microcentrifuge tube with a ROUNDED BELL bottom (the
// demo's `buildTube`). Clear glass wall + rim, a frosted writing patch, a hinged
// cap, and liquid that conforms to the interior (fill prop).
//
// When given an `anim` behavior descriptor (from resolveBehavior/resolveRecipe)
// it drives per-action MOTION in useFrame, matching the demo: vortex swirl +
// wobble, discard tip + drain, a pour stream with the fill rising, a pipette
// meniscus ripple, an incubate pulse. Motion lives here; the scene just passes
// the descriptor for the active sample.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils } from 'three'
import { liquidProps } from './materials.js'
import Glass from './Glass.jsx'
import { TUBE_PROFILE, toPoints } from './profiles.js'
import { liquidPoints, innerRadiusAt } from './liquid.js'
import { theme } from '../theme.js'

const damp = MathUtils.damp

export default function Microtube({
  R = 0.34,
  H = 1.7,
  fill = 0.5,
  color = theme.liquid.accent,
  capColor = '#2b323b',
  cap = true,
  hero = false,
  anim = null,
  ...props
}) {
  const wall = useMemo(() => toPoints(TUBE_PROFILE, R, H), [R, H])
  const liquid = useMemo(
    () => (fill > 0.01 ? liquidPoints(TUBE_PROFILE, R, H, fill) : null),
    [R, H, fill],
  )
  const topY = fill * H
  const topR = innerRadiusAt(TUBE_PROFILE, R, H, topY)

  const group = useRef()
  const liquidRef = useRef()
  const meniscus = useRef()
  const stream = useRef()
  const st = useRef({ lvl: 1, tip: 0 }).current

  useFrame((state, dt) => {
    if (!anim) return
    dt = Math.min(dt, 1 / 30)
    const t = state.clock.elapsedTime
    // ── vessel-level motion: swirl (spin), wobble (shake), lean (tip)
    if (group.current) {
      if (anim.swirl) group.current.rotation.y += dt * anim.swirl
      st.tip = damp(st.tip, anim.tip || 0, 5, dt)
      group.current.rotation.z = (anim.shake ? Math.sin(t * 26) * anim.shake : 0) - st.tip * 0.35
    }
    // ── liquid level: pour ramps up, discard drains, incubate pulses
    let target = 1
    if (anim.pour) target = 0.4 + ((Math.sin(t * 0.7 - Math.PI / 2) + 1) / 2) * 0.7
    else if (anim.tip) target = 0.12
    else if (anim.pulse) target = 1 + Math.sin(t * 2.2) * (anim.pulse * 6)
    st.lvl = damp(st.lvl, target, 4, dt)
    if (liquidRef.current) {
      liquidRef.current.scale.y = st.lvl
      if (anim.swirl) liquidRef.current.rotation.y += dt * anim.swirl
    }
    // ── surface ripple on pipette/pulse; track the rising/falling level
    if (meniscus.current) {
      const ripple = anim.pipette ? 1 + Math.sin(t * 9) * 0.06 : anim.pulse ? 1 + Math.sin(t * 2.2) * 0.05 : 1
      meniscus.current.position.y = topY * st.lvl
      meniscus.current.scale.set(topR * ripple, topR * 0.14, topR * ripple)
    }
    // ── pour stream visible only while actively pouring
    if (stream.current) {
      const pouring = anim.pour && Math.sin(t * 0.7) > -0.2
      stream.current.visible = !!pouring
    }
  })

  return (
    <group ref={group} {...props}>
      {/* glass wall */}
      <mesh castShadow>
        <latheGeometry args={[wall, 96]} />
        <Glass hero={hero} />
      </mesh>
      {/* rim lip */}
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R * 1.02, 0.024, 16, 64]} />
        <Glass hero={hero} />
      </mesh>
      {/* frosted writing patch moulded into the front wall */}
      <mesh position={[0, H * 0.6, 0]}>
        <cylinderGeometry args={[R * 0.965, R * 0.9, H * 0.3, 24, 1, true, Math.PI * 0.5 - 0.62, 1.24]} />
        <meshStandardMaterial color="#e9edf1" roughness={0.92} metalness={0} transparent opacity={0.82} side={2} />
      </mesh>
      {/* pour stream — a thin falling ribbon of the reagent (shown during pour) */}
      <mesh ref={stream} position={[0, H * 1.05, 0]} visible={false}>
        <cylinderGeometry args={[0.03, 0.05, H * 0.9, 12]} />
        <meshPhysicalMaterial color={color} roughness={0.1} transmission={0.4} thickness={0.4} transparent opacity={0.9} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      {/* liquid, conforming to the tube interior, with a domed meniscus */}
      {liquid && (
        <>
          <mesh ref={liquidRef}>
            <latheGeometry args={[liquid, 64]} />
            <meshPhysicalMaterial {...liquidProps(color)} />
          </mesh>
          <mesh ref={meniscus} position={[0, topY, 0]} scale={[topR, topR * 0.14, topR]}>
            <sphereGeometry args={[1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial {...liquidProps(color)} />
          </mesh>
        </>
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
