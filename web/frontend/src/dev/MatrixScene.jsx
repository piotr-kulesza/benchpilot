// MatrixScene — Phase-3 animation harness (?matrix=1). Drives ONE real station for
// any (action, container[, from]) pair through p, reusing the SAME configureStation
// the runner uses (so the harness can't diverge from production). The station's
// timeline eases to the query `p` and holds, so a screenshot shows the true state.
import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { FogExp2, Group, Color } from 'three'
import * as demo from '../scene/demoScene.js'
import { configureStation } from '../vessel/StationScene.jsx'
import { resolveRecipe } from '../vessel/sceneRecipe.js'
import { reagentColor } from '../vessel/theme.js'

const LIGHT_SCALE = 3.3
const INIT_COLOR = 0xb8b2a6
let _maps = false
function ensureMaps() { if (!_maps) { demo.buildSharedMaps(); _maps = true } }
function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose() } m.dispose?.() } })
}

function Lights() {
  const L = demo.LOOK.cinematic
  return (
    <>
      <ambientLight color={L.amb.color} intensity={L.amb.int * LIGHT_SCALE} />
      <hemisphereLight color={L.hemi.sky} groundColor={L.hemi.ground} intensity={L.hemi.int * LIGHT_SCALE} />
      <directionalLight color={L.key.color} intensity={L.key.int * LIGHT_SCALE} position={[5, 11, 7]} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-camera-near={1} shadow-camera-far={44} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={11} shadow-camera-bottom={-9} />
      <directionalLight color={L.fill.color} intensity={L.fill.int * LIGHT_SCALE} position={L.fill.pos} />
      <directionalLight color={L.aux.color} intensity={L.aux.int * LIGHT_SCALE} position={L.aux.pos} />
    </>
  )
}

export function MatrixScene({ action = 'pour_add', container = 'microtube', from = null, p = 0.5 }) {
  const { gl, scene } = useThree()
  const stRef = useRef(null)
  const pRef = useRef(0)
  const camRef = useRef(null)

  // env once
  useEffect(() => {
    demo.setRenderer(gl); demo.setScene(scene); ensureMaps()
    scene.environment = demo.buildEnvMap('cinematic')
    scene.background = demo.makeCineBackdrop()
    scene.environmentIntensity = 2.5; scene.backgroundIntensity = 1.19
    const f = demo.LOOK.cinematic.fog; scene.fog = new FogExp2(f.color, f.density)
    return () => { scene.environment = null; scene.background = null; scene.fog = null }
  }, [gl, scene])

  // build the station for this cell
  useEffect(() => {
    ensureMaps()
    const S = demo.initSample()
    S.vessels.forEach((v) => v.userData.label && (v.userData.label.visible = false))
    const recipe = resolveRecipe(action)
    const endColor = new Color(reagentColor(action)).getHex()
    const st = { group: new Group(), updatables: [], reagents: {}, pip: null, enter: null, timeline: null, x: 0, cen: null, dev: null, vis: 0, _vstate: -1 }
    configureStation(st, {
      action, equipment: recipe.equipment, container, prevContainer: from || null,
      color: endColor, name: action, vol: '', seconds: 30,
      startColor: INIT_COLOR, startLevel: 0.4, endColor, endLevel: recipe.anim.fill, cycles: 30,
    })
    scene.add(st.group)
    demo.setSnap(true); st.enter?.(); demo.setSnap(false)
    pRef.current = 0
    stRef.current = st
    return () => {
      scene.remove(st.group); disposeGroup(st.group)
      demo.undockSample()
      S.vessels.forEach((v) => { scene.remove(v); disposeGroup(v) })
    }
  }, [scene, action, container, from])

  useFrame((_s, dt) => {
    const st = stRef.current; if (!st) return
    dt = Math.min(dt, 0.05)
    pRef.current = demo.lerp(pRef.current, p, 1 - Math.pow(0.015, dt)) // ease to the query p and hold
    st.timeline?.(pRef.current)
    for (const u of st.updatables) u.userData?.update?.(dt)
    const S = demo.getSample()
    if (S) for (const v of S.vessels) { if (!v.userData.docked) v.position.lerp(v.userData.tPos, 1 - Math.pow(0.02, dt)); v.userData.update?.(dt) }
    // honour the station's camera PUSH (same as the runner) so the harness verifies it
    const cam = camRef.current
    if (cam) {
      let px = 0, py = 3.35, pz = 9.6, lx = 0, ly = 1.05, lz = 0
      const push = st.pushCam ? st.pushCam(pRef.current) : 0
      if (push > 0 && st.pushTarget) {
        const t = st.pushTarget
        px = demo.lerp(px, t.pos[0], push); py = demo.lerp(py, t.pos[1], push); pz = demo.lerp(pz, t.pos[2], push)
        lx = demo.lerp(lx, t.look[0], push); ly = demo.lerp(ly, t.look[1], push); lz = demo.lerp(lz, t.look[2], push)
      }
      cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz)
    }
  })

  return (
    <>
      <Lights />
      <FloorOnce />
      <PerspectiveCamera ref={camRef} makeDefault fov={40} near={0.1} far={260} position={[0, 3.35, 9.6]} />
    </>
  )
}

function FloorOnce() {
  const { scene } = useThree()
  useEffect(() => { const f = demo.buildFloor(0); scene.add(f); return () => { scene.remove(f); disposeGroup(f) } }, [scene])
  return null
}
