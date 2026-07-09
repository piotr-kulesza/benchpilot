// The 3D scene that lives inside <Canvas>. ONE glass vessel in a fixed studio;
// only its STATE changes per action. Cohesion = same glass, same light.

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Environment,
  Lightformer,
  Float,
  ContactShadows,
  MeshTransmissionMaterial,
} from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { theme } from './theme.js'
import { VIAL_PROFILE, INNER } from './geometry.js'

const lerp = THREE.MathUtils.lerp
const damp = THREE.MathUtils.damp

// ── studio lighting: area lights inside the env map → real reflections, no HDRI
function Studio() {
  const e = theme.env
  return (
    <Environment resolution={e.resolution}>
      <color attach="background" args={[e.base]} />
      <Lightformer form="rect" intensity={e.key.intensity} color={e.key.color} position={e.key.position} scale={e.key.scale} rotation={[-Math.PI / 2, 0, 0]} />
      <Lightformer form="rect" intensity={e.fillL.intensity} color={e.fillL.color} position={e.fillL.position} scale={e.fillL.scale} rotation={[0, Math.PI / 2, 0]} />
      <Lightformer form="rect" intensity={e.fillR.intensity} color={e.fillR.color} position={e.fillR.position} scale={e.fillR.scale} rotation={[0, -Math.PI / 2, 0]} />
      <Lightformer form="ring" intensity={e.rim.intensity} color={e.rim.color} position={e.rim.position} scale={e.rim.scale} />
    </Environment>
  )
}

// ── a soft studio gradient behind the vessel. Clear glass is invisible over a
// flat colour; this gives it a graded field to refract and reflect, which is
// what makes it read as glass. Rendered from a plain CanvasTexture (bulletproof,
// no extra deps) and captured by the transmission buffer.
function useGradientTexture(colors, stops) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 512
    const ctx = c.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, 0, 512)
    colors.forEach((col, i) => grad.addColorStop(stops[i], col))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 16, 512)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [colors, stops])
}

function Backdrop() {
  const g = theme.backdrop
  const tex = useGradientTexture(g.colors, g.stops)
  return (
    <mesh position={[0, 0.2, -5]} scale={[18, 12, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={tex} toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

// ── the reusable glass body (used for the main vessel and the transfer clone)
function Glass({ materialRef, scale = 1 }) {
  const g = theme.glass
  const points = useMemo(() => VIAL_PROFILE, [])
  return (
    <mesh scale={scale} castShadow>
      <latheGeometry args={[points, 64]} />
      <MeshTransmissionMaterial
        ref={materialRef}
        background={new THREE.Color(theme.background.bottom)}
        transmission={g.transmission}
        thickness={g.thickness}
        roughness={g.roughness}
        ior={g.ior}
        chromaticAberration={g.chromaticAberration}
        anisotropy={g.anisotropy}
        samples={g.samples}
        resolution={g.resolution}
        backside={g.backside}
        backsideThickness={g.backsideThickness}
        attenuationColor={g.attenuationColor}
        attenuationDistance={g.attenuationDistance}
        envMapIntensity={g.envMapIntensity}
        color={g.color}
      />
    </mesh>
  )
}

function VesselGroup({ behavior, liquidColor, progress, running }) {
  const group = useRef()
  const glassMat = useRef()
  const body = useRef()
  const meniscus = useRef()
  const bubbles = useRef()
  const bottle = useRef()
  const stream = useRef()
  const pipette = useRef()
  const drop = useRef()
  const ring = useRef()
  const warmLight = useRef()
  const coldLight = useRef()
  const iceGroup = useRef()

  // smoothed state we lerp toward the behavior's targets
  const st = useRef({ fill: behavior.fill, roughness: theme.glass.roughness, spinY: 0, tip: 0, warm: 0, cold: 0 }).current
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const bubbleSeed = useMemo(() => Array.from({ length: 16 }, () => ({ x: (Math.random() - 0.5) * 0.6, z: (Math.random() - 0.5) * 0.6, p: Math.random(), s: 0.4 + Math.random() * 0.7, sp: 0.25 + Math.random() * 0.3 })), [])
  const col = useMemo(() => new THREE.Color(liquidColor), [liquidColor])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const bh = behavior
    dt = Math.min(dt, 1 / 30)

    // ── liquid fill (pour ramps up; discard drains; wash pulses; else steady)
    let targetFill = bh.fill
    if (bh.pour) targetFill = lerp(0.12, 0.5, (Math.sin(t * 0.7 - Math.PI / 2) + 1) / 2)
    if (bh.flowThrough) targetFill = bh.fill + Math.sin(t * 1.6) * 0.05
    if (bh.tip) targetFill = lerp(bh.fill, 0.04, (Math.sin(t * 0.8 - Math.PI / 2) + 1) / 2)
    if (bh.drop) targetFill = bh.fill + (Math.sin(t * 0.9) * 0.5 + 0.5) * 0.04
    st.fill = damp(st.fill, targetFill, 4, dt)

    const level = INNER.bottom + st.fill * INNER.height
    const bodyH = Math.max(0.02, level - INNER.bottom)
    if (body.current) {
      body.current.scale.y = bodyH
      body.current.position.y = INNER.bottom + bodyH / 2
      // swirl squash + pulse
      const swirlSquash = bh.swirl ? 1 + Math.sin(t * 8) * 0.03 : 1
      const pulse = bh.pulse ? 1 + Math.sin(t * 2.2) * bh.pulse : 1
      body.current.scale.x = swirlSquash * pulse
      body.current.scale.z = (bh.swirl ? 1 - Math.sin(t * 8) * 0.03 : 1) * pulse
      if (bh.swirl) body.current.rotation.y += dt * bh.swirl
    }
    if (meniscus.current) {
      meniscus.current.position.y = level
      const ripple = bh.pipette ? 1 + Math.sin(t * 9) * 0.06 : bh.pulse ? 1 + Math.sin(t * 2.2) * 0.05 : 1
      meniscus.current.scale.set(INNER.radius * 1.02 * ripple, 0.14 * ripple, INNER.radius * 1.02 * ripple)
      meniscus.current.rotation.y += dt * (bh.swirl || 0.3)
    }

    // ── vessel-level motion: spin (centrifuge), shake (vortex/discard), tip (discard)
    st.spinY += dt * (bh.spin || 0)
    st.tip = damp(st.tip, bh.tip || 0, 5, dt)
    if (group.current) {
      group.current.rotation.y = st.spinY
      group.current.rotation.z = (bh.shake ? Math.sin(t * 26) * bh.shake : 0) + st.tip * -1
      group.current.position.x = bh.tip ? st.tip * 0.35 : 0
    }

    // ── glass frost (cool_ice raises roughness + cold cast)
    st.roughness = damp(st.roughness, bh.frost ? 0.5 : theme.glass.roughness, 4, dt)
    if (glassMat.current) glassMat.current.roughness = st.roughness
    st.warm = damp(st.warm, bh.warm ? 1 : 0, 3, dt)
    st.cold = damp(st.cold, bh.frost ? 1 : 0, 3, dt)
    if (warmLight.current) warmLight.current.intensity = st.warm * 3.2 * (0.8 + Math.sin(t * 4) * 0.2)
    if (coldLight.current) coldLight.current.intensity = st.cold * 2.4
    if (body.current) {
      const em = body.current.material
      if (em) {
        em.emissive.copy(col)
        em.emissiveIntensity = st.warm * 0.5 + (bh.ring ? 0.12 + (1 - progress) * 0.2 : 0.06)
      }
    }

    // ── heat bubbles
    if (bubbles.current) {
      bubbles.current.visible = bh.bubbles
      if (bh.bubbles) {
        bubbleSeed.forEach((b, i) => {
          const yy = ((b.p + t * b.sp) % 1)
          const y = INNER.bottom + 0.05 + yy * (level - INNER.bottom - 0.05)
          const wob = Math.sin(t * 3 + i) * 0.03
          dummy.position.set(b.x * INNER.radius * 1.3 + wob, y, b.z * INNER.radius * 1.3)
          const sc = (0.03 + b.s * 0.03) * (0.5 + yy)
          dummy.scale.setScalar(sc)
          dummy.updateMatrix()
          bubbles.current.setMatrixAt(i, dummy.matrix)
        })
        bubbles.current.instanceMatrix.needsUpdate = true
      }
    }

    // ── pour bottle + stream
    if (bottle.current) {
      bottle.current.visible = bh.pour
      if (bh.pour) {
        const pouring = Math.sin(t * 0.7) > -0.2
        bottle.current.rotation.z = lerp(-0.2, -1.15, (Math.sin(t * 0.7) + 1) / 2)
        if (stream.current) stream.current.visible = pouring
      }
    }
    // ── pipette + drop
    if (pipette.current) {
      pipette.current.visible = bh.pipette
      if (bh.pipette) pipette.current.position.y = 1.5 + Math.sin(t * 2) * 0.12
    }
    if (drop.current) {
      const active = bh.pipette || bh.drop
      drop.current.visible = active
      if (active) {
        const speed = bh.drop ? 0.5 : 1.6
        const yy = 1 - ((t * speed) % 1)
        drop.current.position.y = level + 0.04 + yy * (1.35 - level)
        drop.current.scale.setScalar(bh.drop ? 0.07 : 0.05)
      }
    }
    if (iceGroup.current) {
      iceGroup.current.visible = bh.frost
      if (bh.frost) iceGroup.current.rotation.y += dt * 0.3
    }
    if (ring.current) {
      ring.current.visible = bh.ring
      if (bh.ring) {
        ring.current.rotation.z += dt * 0.4
        const m = ring.current.material
        m.emissiveIntensity = 0.6 + Math.sin(t * 2) * 0.25
      }
    }
  })

  return (
    <group scale={theme.vesselScale}>
      <Float speed={theme.motion.floatSpeed} rotationIntensity={theme.motion.floatRotation} floatIntensity={theme.motion.floatIntensity}>
        <group ref={group}>
          <Glass materialRef={glassMat} />

          {/* liquid: body + domed meniscus — kept fairly opaque + saturated so it
              reads clearly through the glass (pure transmission washes out). */}
          <mesh ref={body} position={[0, INNER.bottom, 0]}>
            <cylinderGeometry args={[INNER.radius, INNER.radius * 0.94, 1, 48, 1, false]} />
            <meshPhysicalMaterial
              color={liquidColor}
              roughness={0.32}
              metalness={0}
              emissive={liquidColor}
              emissiveIntensity={0.34}
              clearcoat={0.35}
              clearcoatRoughness={0.25}
              envMapIntensity={0.2}
            />
          </mesh>
          <mesh ref={meniscus} position={[0, 0, 0]}>
            <sphereGeometry args={[1, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial color={liquidColor} roughness={0.14} metalness={0} clearcoat={0.7} clearcoatRoughness={0.15} emissive={liquidColor} emissiveIntensity={0.16} envMapIntensity={0.3} />
          </mesh>

          {/* heat bubbles */}
          <instancedMesh ref={bubbles} args={[undefined, undefined, 16]} visible={false}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshPhysicalMaterial color={'#ffffff'} transmission={0.9} thickness={0.1} roughness={0.05} transparent opacity={0.55} />
          </instancedMesh>

          {/* incubate progress ring */}
          <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} visible={false}>
            <torusGeometry args={[0.92, 0.03, 16, 80]} />
            <meshStandardMaterial color={theme.accents.ring} emissive={theme.accents.ring} emissiveIntensity={0.6} toneMapped={false} />
          </mesh>

          {/* frost ice cubes */}
          <group ref={iceGroup} position={[0, 0.55, 0]} visible={false}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.42, i * 0.06, Math.sin((i / 3) * Math.PI * 2) * 0.42]} rotation={[i, i * 1.3, 0]}>
                <boxGeometry args={[0.2, 0.2, 0.2]} />
                <meshPhysicalMaterial color={'#eaf6ff'} transmission={0.85} thickness={0.5} roughness={0.25} ior={1.31} transparent opacity={0.85} />
              </mesh>
            ))}
          </group>

          {/* pipette + drop */}
          <group ref={pipette} position={[0, 1.5, 0]} visible={false}>
            <mesh position={[0, 0.35, 0]}>
              <cylinderGeometry args={[0.11, 0.11, 0.7, 20]} />
              <meshStandardMaterial color={'#e7edf1'} roughness={0.35} metalness={0.1} />
            </mesh>
            <mesh position={[0, -0.12, 0]}>
              <coneGeometry args={[0.11, 0.5, 20]} />
              <meshStandardMaterial color={'#f4f8fb'} roughness={0.25} />
            </mesh>
          </group>
          <mesh ref={drop} visible={false}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshPhysicalMaterial color={liquidColor} transmission={0.5} thickness={0.3} roughness={0.1} transparent opacity={0.92} emissive={liquidColor} emissiveIntensity={0.15} />
          </mesh>
        </group>
      </Float>

      {/* pour bottle (outside Float so the tilt reads clearly) */}
      <group ref={bottle} position={[1.15, 1.35, 0.1]} visible={false}>
        <mesh>
          <cylinderGeometry args={[0.32, 0.32, 0.7, 24]} />
          <meshStandardMaterial color={'#2c8f84'} roughness={0.3} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.1, 0.12, 0.28, 16]} />
          <meshStandardMaterial color={'#b7c0c7'} roughness={0.4} />
        </mesh>
        <mesh ref={stream} position={[-0.35, -0.55, 0]} rotation={[0, 0, 0.35]}>
          <cylinderGeometry args={[0.02, 0.06, 1.1, 12]} />
          <meshPhysicalMaterial color={liquidColor} transmission={0.4} thickness={0.5} roughness={0.1} transparent opacity={0.9} emissive={liquidColor} emissiveIntensity={0.2} />
        </mesh>
      </group>

      {/* warm / cold accent lights for heat / cool_ice */}
      <pointLight ref={warmLight} color={theme.accents.warm} position={[0.6, -0.4, 1]} intensity={0} distance={5} />
      <pointLight ref={coldLight} color={theme.accents.cold} position={[-0.6, 0.6, 1.2]} intensity={0} distance={5} />
    </group>
  )
}

// second vessel for `transfer` — a smaller clone that fills as the main drains
function TransferClone({ visible, liquidColor }) {
  const mat = useRef()
  const body = useRef()
  useFrame((state) => {
    if (!body.current) return
    const t = state.clock.elapsedTime
    const f = (Math.sin(t * 0.8 - Math.PI / 2) + 1) / 2
    const h = Math.max(0.02, 0.05 + f * 0.7)
    body.current.scale.y = h
    body.current.position.y = -0.55 + h / 2
  })
  if (!visible) return null
  return (
    <group position={[1.35, -0.25, -0.2]} scale={0.7}>
      <Glass materialRef={mat} />
      <mesh ref={body}>
        <cylinderGeometry args={[INNER.radius, INNER.radius * 0.96, 1, 40]} />
        <meshPhysicalMaterial color={liquidColor} transmission={0.35} thickness={1} roughness={0.2} transparent opacity={0.9} emissive={liquidColor} emissiveIntensity={0.08} />
      </mesh>
    </group>
  )
}

function CameraDrift() {
  const { camera } = useThree()
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const m = theme.motion
    camera.position.x = Math.sin(t * m.cameraDriftSpeed) * m.cameraDrift
    camera.position.y = theme.camera.position[1] + Math.sin(t * m.cameraDriftSpeed * 0.7) * 0.05
    camera.lookAt(theme.camera.lookAt[0], theme.camera.lookAt[1], theme.camera.lookAt[2])
  })
  return null
}

export default function Scene({ behavior, liquidColor, progress = 1, running = false, temp = null }) {
  const p = theme.post
  return (
    <>
      <Studio />
      <Backdrop />
      <CameraDrift />
      <VesselGroup behavior={behavior} liquidColor={liquidColor} progress={progress} running={running} />
      <TransferClone visible={behavior.transfer} liquidColor={liquidColor} />

      <ContactShadows
        position={theme.shadow.position}
        opacity={theme.shadow.opacity}
        blur={theme.shadow.blur}
        far={theme.shadow.far}
        scale={theme.shadow.scale}
        color={theme.shadow.color}
        resolution={512}
      />

      <EffectComposer disableNormalPass multisampling={4}>
        <Bloom intensity={p.bloom.intensity} luminanceThreshold={p.bloom.luminanceThreshold} luminanceSmoothing={p.bloom.luminanceSmoothing} mipmapBlur={p.bloom.mipmapBlur} />
        <Vignette eskil={false} offset={p.vignette.offset} darkness={p.vignette.darkness} />
      </EffectComposer>
    </>
  )
}
