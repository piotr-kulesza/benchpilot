// DevScene — the shared 3D environment for the model gallery (?models=1) and the
// animation matrix (?matrix=1). It reproduces the runner's exact lighting, env map,
// backdrop, fog and tone response (via DevCanvas) so a model/animation is judged in
// the SAME look it ships in — no dev-only flattering light.
import { useEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { FogExp2, Group } from 'three'
import * as demo from '../scene/demoScene.js'
import { getModel } from './registry.js'

const LIGHT_SCALE = 3.3 // matches StationScene: modern three divides diffuse by π

let _maps = false
function ensureMaps() { if (!_maps) { demo.buildSharedMaps(); _maps = true } }

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose() } m.dispose?.() }
  })
}

function Lights() {
  const L = demo.LOOK.cinematic
  return (
    <>
      <ambientLight color={L.amb.color} intensity={L.amb.int * LIGHT_SCALE} />
      <hemisphereLight color={L.hemi.sky} groundColor={L.hemi.ground} intensity={L.hemi.int * LIGHT_SCALE} />
      <directionalLight
        color={L.key.color} intensity={L.key.int * LIGHT_SCALE} position={[5, 11, 7]}
        castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-near={1} shadow-camera-far={44}
        shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={11} shadow-camera-bottom={-9}
      />
      <directionalLight color={L.fill.color} intensity={L.fill.int * LIGHT_SCALE} position={L.fill.pos} />
      <directionalLight color={L.aux.color} intensity={L.aux.int * LIGHT_SCALE} position={L.aux.pos} />
    </>
  )
}

// one-time renderer/scene/env setup, shared by both dev modes
function useDevEnv() {
  const { gl, scene } = useThree()
  useEffect(() => {
    demo.setRenderer(gl)
    demo.setScene(scene)
    ensureMaps()
    scene.environment = demo.buildEnvMap('cinematic')
    scene.background = demo.makeCineBackdrop()
    scene.environmentIntensity = 2.5
    scene.backgroundIntensity = 1.19
    const f = demo.LOOK.cinematic.fog
    scene.fog = new FogExp2(f.color, f.density)
    return () => { scene.environment = null; scene.background = null; scene.fog = null }
  }, [gl, scene])
}

// camera pose for an angle, given the content half-width W and a look height h
function poseFor(angle, mx, W, h) {
  if (angle === 'iso') return { pos: [mx + W * 0.95, W * 0.9, W * 0.95], look: [mx, h, 0] }
  if (angle === 'top') return { pos: [mx, W * 1.7, 0.001], look: [mx, 0, 0] }
  return { pos: [mx, W * 0.5, W * 1.25], look: [mx, h, 0] } // 'front'
}

// GALLERY: one model at origin + a reference microtube beside it + the bench.
export function GalleryScene({ item, angle = 'front' }) {
  useDevEnv()
  const { scene } = useThree()
  const camRef = useRef()
  const model = getModel(item)

  const group = useMemo(() => {
    ensureMaps()
    const g = new Group()
    if (model) { const m = model.build(); m.userData.update?.(0.001); g.add(m) }
    // reference microtube, always to the LEFT for scale
    const span = model?.span || 2.4
    const refX = -(span / 2 + 1.7)
    const ref = demo.buildTube({ height: 1.7, radius: 0.32, color: demo.COL.pellet, label: 'ref' })
    ref.position.set(refX, 0, 0)
    g.add(ref)
    g.userData.refX = refX
    g.userData.span = span
    return g
  }, [item]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scene.add(group)
    return () => { scene.remove(group); disposeGroup(group) }
  }, [scene, group])

  const floor = useMemo(() => demo.buildFloor(0), [])
  useEffect(() => { scene.add(floor); return () => { scene.remove(floor); disposeGroup(floor) } }, [scene, floor])

  // frame: content spans from the ref tube (left) to the model's right edge
  const span = group.userData.span
  const refX = group.userData.refX
  const W = (span - refX) * 0.62 + 1.2
  const mx = (refX + span / 2) / 2
  const h = Math.max(0.6, span * 0.22)
  const { pos, look } = poseFor(angle, mx, W, h)

  useFrame(() => { if (camRef.current) camRef.current.lookAt(look[0], look[1], look[2]) })

  return (
    <>
      <Lights />
      <PerspectiveCamera ref={camRef} makeDefault fov={40} near={0.1} far={260} position={pos} />
    </>
  )
}
