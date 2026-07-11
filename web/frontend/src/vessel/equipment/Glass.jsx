// Glass — the vessel wall material. The HERO (active) vessel gets true
// transmissive <MeshTransmissionMaterial> (refracts the background + a crisp
// key-softbox specular); neighbours get the cheaper physical-glass fallback (no
// per-frame buffer). All knobs live in theme.glass / theme.glassFallback.
//
// Used as a material child: `<mesh><Glass hero /></mesh>`.

import { MeshTransmissionMaterial } from '@react-three/drei'
import { DoubleSide } from 'three'
import { theme } from '../theme.js'

export default function Glass({ hero = false }) {
  if (hero) {
    const g = theme.glass
    return (
      <MeshTransmissionMaterial
        transmission={g.transmission}
        roughness={g.roughness}
        ior={g.ior}
        thickness={g.thickness}
        chromaticAberration={g.chromaticAberration}
        anisotropicBlur={g.anisotropicBlur}
        distortionScale={g.distortionScale}
        temporalDistortion={g.temporalDistortion}
        samples={g.samples}
        resolution={g.resolution}
        color={g.color}
        clearcoat={g.clearcoat}
        clearcoatRoughness={g.clearcoatRoughness}
        envMapIntensity={g.envMapIntensity}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    )
  }
  const f = theme.glassFallback
  return (
    <meshPhysicalMaterial
      color={f.color}
      transmission={f.transmission}
      roughness={f.roughness}
      clearcoat={f.clearcoat}
      clearcoatRoughness={f.clearcoatRoughness}
      ior={f.ior}
      thickness={f.thickness}
      envMapIntensity={f.envMapIntensity}
      transparent
      depthWrite={false}
      side={DoubleSide}
    />
  )
}
