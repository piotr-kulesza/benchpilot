// sample.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the ONE travelling sample and the carried prep tubes (scene state, docking, preps). Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from './rng.js'
import * as THREE from 'three'
import { exitLiftPoint } from '../vessel/sceneRecipe.js'
import { COL } from './palette.js'
import { buildAgarPlate, buildCryovial, buildDish, buildFlask, buildGelSlab, buildMembrane, buildSlide, buildSpinColumn, buildTube, buildWellPlate } from './vessels.js'


// The demo's scene-scope singletons that its choreography (stationReagent /
// stationSpin / SAMPLE) closes over — set by the React layer, exactly as the
// demo's `scene` / `SAMPLE` / `SNAP_SAMPLE` globals.
let scene = null
let SNAP_SAMPLE = false
let SAMPLE = null
export function setScene(s) { scene = s }
export function setSnap(v) { SNAP_SAMPLE = v }
export function getSnap() { return SNAP_SAMPLE }
export function initSample() { SAMPLE = buildSample(); return SAMPLE }
export function getSample() { return SAMPLE }

// ── PREP VESSELS — a prepared mixture is a SECOND travelling object, on the SAME rails
// as the sample. Built ONCE at its `prepare` station, it persists on the bench with the
// mixture it ended up holding, and is CARRIED (glided, never teleported) to the station
// that draws from it. Keyed by the parsed `produces` id. Reuses the sample's tPos/glide
// machinery: the frame loop eases each prep toward its tPos, snapping only on a jump.
let PREPS = {}
function disposePrep(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) { for (const k in m) { const t = m[k]; if (t && t.isTexture) t.dispose() } m.dispose?.() }
  })
}
export function initPreps() {
  for (const id in PREPS) { const v = PREPS[id]; if (scene) scene.remove(v); disposePrep(v) }
  PREPS = {}
}
// Create the prep tube ONCE (idempotent — a rebuild returns the existing object so it is
// never duplicated). Parented to the scene (world coords) so it can travel between stations.
export function makePrep(id, opts = {}) {
  if (PREPS[id]) return PREPS[id]
  const v = buildTube(opts)
  v.userData.noFrame = true
  v.userData.tPos = v.position.clone()
  if (scene) scene.add(v)
  PREPS[id] = v
  return v
}
export function getPrep(id) { return PREPS[id] || null }
export function getPreps() { return Object.values(PREPS) }
export function setPrepVisible(id, vis) { const v = PREPS[id]; if (v) v.visible = !!vis }
// set a prep's travel target — snap on a jump (SNAP_SAMPLE), glide otherwise, exactly
// like S.at for the sample.
export function prepAt(id, x, y, z) {
  const v = PREPS[id]; if (!v) return
  v.userData.tPos.set(x, y, z)
  if (SNAP_SAMPLE) v.position.set(x, y, z)
}
// If a step change interrupts a spin, the sample may still be parented into a
// centrifuge rotor slot — return every vessel to the scene (upright, full size).
// The sample NEVER teleports: when `lift` is set (a sequential Next), a vessel that
// was docked rises STRAIGHT UP out of the instrument (an `exitLift` waypoint the frame
// loop honours before the normal glide) so it never drags diagonally through the rotor
// or the lid. On a jump (`lift` false) we just free it — a jump is allowed to snap.
export function undockSample(lift = false) {
  if (!SAMPLE || !scene) return
  for (const v of SAMPLE.vessels) {
    const wasDocked = v.userData.docked
    if (v.parent && v.parent !== scene) scene.attach(v)
    if (wasDocked) {
      v.userData.docked = false; v.rotation.set(0, 0, 0); v.scale.setScalar(1)
      if (lift) {
        const lp = exitLiftPoint(v.position, v.userData.exitY != null ? v.userData.exitY : v.position.y)
        v.userData.exitLift = (v.userData.exitLift || new THREE.Vector3()).set(lp.x, lp.y, lp.z)
      } else {
        v.userData.exitLift = null
      }
    } else {
      v.userData.exitLift = null
    }
  }
}

  function buildSample(){
    var tube   = buildTube({color:COL.pellet, label:"Neutrophil pellet", sub:"", cold:true, capColor:0x3f7fd0});
    var column = buildSpinColumn();
    var elu    = buildTube({color:COL.rna, label:"Eluate", sub:"RNA", capColor:0x49b26a});
    // Stage-8: the sample can also be ANY of these container types — one persistent
    // travelling sample carried through the actual glassware of any protocol.
    var S={ tube:tube, column:column, elu:elu,
      cryovial:buildCryovial(), wellplate:buildWellPlate(), flask:buildFlask(), dish:buildDish(),
      slide:buildSlide(), membrane:buildMembrane(), gel:buildGelSlab(), agarplate:buildAgarPlate() };
    var KEYS=['tube','column','elu','cryovial','wellplate','flask','dish','slide','membrane','gel','agarplate'];
    var vessels=KEYS.map(function(k){ return S[k]; });
    S.vessels=vessels; S.active=tube;
    for(var v=0;v<vessels.length;v++){
      vessels[v].visible=false; vessels[v].userData.tPos=vessels[v].position.clone(); scene.add(vessels[v]);
    }
    // show exactly one vessel (hand-off timelines may reveal a second mid-station)
    S.only=function(name){
      for(var i=0;i<KEYS.length;i++){ S[KEYS[i]].visible=(KEYS[i]===name); }
      // any station that shows a vessel gets it WHOLE (a nest move may have left the
      // column's collection tube behind on its own bench)
      if(S[name] && S[name].userData.reattachCollection) S[name].userData.reattachCollection();
      S.active=S[name]||tube;
    };
    // set a vessel's travel target; snap instantly on non-sequential jumps, glide otherwise
    S.at=function(vessel,x,y,z){ vessel.userData.tPos.set(x,y,z); if(SNAP_SAMPLE) vessel.position.set(x,y,z); };
    S.snapTo=function(vessel,x,y,z){ vessel.userData.tPos.set(x,y,z); vessel.position.set(x,y,z); };
    return S;
  }

// per-builder seeded random streams (rng.js) — the same names as before the split
buildSample = streams.wrap('buildSample', buildSample)

export { scene, SNAP_SAMPLE, SAMPLE, PREPS, disposePrep, buildSample }
