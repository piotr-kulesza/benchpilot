// Glass — the vessel wall material. Ported 1:1 from the demo's glassMaterial() +
// fresnelize(): a STYLIZED faked glass, NOT a photoreal transmissive render. It
// is a plain MeshPhysicalMaterial with low opacity, clearcoat, and a muted
// neutral fresnel rim added in the shader. No MeshTransmissionMaterial, no
// transmission/ior/thickness/chromatic-aberration. ONE material for every vessel.
//
// Used as a material child: `<mesh><Glass /></mesh>`.

import { DoubleSide } from 'three'
import { theme } from '../theme.js'

// demo fresnelize(): add a restrained neutral edge highlight + lift edge alpha so
// the thin glass reads at grazing angles. Injected before the final colour write.
// (three renamed the chunk output_fragment → opaque_fragment; handle both.)
function fresnelize(shader) {
  const inject = [
    'float rimF = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);',
    'outgoingLight += vec3(0.62,0.68,0.74) * rimF * 0.45;',
    'diffuseColor.a = clamp(diffuseColor.a + rimF * 0.30, 0.0, 1.0);',
  ].join('\n')
  const token = shader.fragmentShader.includes('#include <opaque_fragment>')
    ? '#include <opaque_fragment>'
    : '#include <output_fragment>'
  shader.fragmentShader = shader.fragmentShader.replace(token, `${inject}\n${token}`)
}
const glassCacheKey = () => 'glassFresnelMuted'

export default function Glass() {
  const g = theme.glass
  return (
    <meshPhysicalMaterial
      color={g.color}
      metalness={0}
      roughness={g.roughness}
      transparent
      opacity={g.opacity}
      clearcoat={g.clearcoat}
      clearcoatRoughness={g.clearcoatRoughness}
      envMapIntensity={g.envMapIntensity}
      reflectivity={g.reflectivity}
      side={DoubleSide}
      depthWrite={false}
      onBeforeCompile={fresnelize}
      customProgramCacheKey={glassCacheKey}
    />
  )
}
