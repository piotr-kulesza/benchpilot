// PipetteStand — the demo's buildPipetteStand: a large SATURATED BLUE pipette
// carousel/stand that lives permanently on the bench. It's a signature part of
// the composition — it gives the scene structure and a hit of colour against the
// neutral instruments. Two cradle arms + rings hold pipettes; here it stands as a
// resident prop beside the active station.

import { MAT } from './materials.js'

const BASE = { color: '#244f78', metalness: 0.05, roughness: 0.55, envMapIntensity: 0.8 }
const POST = { color: '#2c608e', metalness: 0.05, roughness: 0.5, envMapIntensity: 0.85 }
const ARM = { color: '#3672a0', metalness: 0.06, roughness: 0.48, envMapIntensity: 0.9 }

function Cradle({ y, r }) {
  return (
    <group>
      <mesh position={[-0.2, y, 0]}>
        <boxGeometry args={[0.5, 0.09, 0.13]} />
        <meshStandardMaterial {...ARM} />
      </mesh>
      <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r, 0.035, 14, 32]} />
        <meshStandardMaterial {...ARM} />
      </mesh>
    </group>
  )
}

export default function PipetteStand(props) {
  return (
    <group {...props}>
      {/* weighted base pad */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.72, 0.12, 40]} />
        <meshStandardMaterial {...BASE} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.5, 0.56, 0.04, 40]} />
        <meshStandardMaterial {...POST} />
      </mesh>
      {/* upright post */}
      <mesh position={[-0.42, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.11, 3.0, 24]} />
        <meshStandardMaterial {...POST} />
      </mesh>
      {/* cradle arms + holder rings */}
      <Cradle y={2.55} r={0.19} />
      <Cradle y={1.75} r={0.17} />
    </group>
  )
}
