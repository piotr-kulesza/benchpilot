// holders.js — what a vessel with a NON-FLAT base stands in on the open bench. A conical
// 1.5 mL tube cannot stand on its tip (geometryAudit: stability); in a lab it stands in a
// rack. REAL SIZE from dims('tube_stand').
import * as THREE from 'three'
import { dims, clearance } from './dims.js'
import { addSocket } from './sockets.js'
import { matPlastic } from './materials.js'
import { declareCutaway, slabWithHoles, tagSpec } from './modelKit.js'

// An OPEN-FRAME stand: a bored deck on two end legs, open underneath and at the front and
// back — the tube's tip rests on the bench through the open floor (so its base centre, its
// origin, is at y = 0: the socket point), the deck holds its straight body upright, and its
// contents stay in view (a solid block would hide the pellet).
// id: the stand's dimensions entry — 'tube_stand' (1.5 mL tubes, spin columns) or
// 'pcr_tube_stand' (0.2 mL PCR tubes: a 1.5 mL bore would let one fall over in it)
export const STAND_IDS = ['tube_stand', 'pcr_tube_stand']
export function standFor(spec) { return STAND_IDS.find((id) => dims(id).accepts.includes(spec)) || null }
export function buildTubeStand(id = 'tube_stand') {
  const D = dims(id)
  const W = D.width, DEP = D.depth, H = D.height, T = D.deck_thickness, LEG = D.leg
  // the bore takes the widest vessel it accepts, plus the socket play
  const boreR = Math.max(...D.accepts.map((s) => dims(s).radius)) + clearance('socket_fit')
  const grp = new THREE.Group()
  // CLEAR ACRYLIC (as many tube stands are): the deck crosses the tube's body in front of the
  // camera, and a nested column's frit sits right behind it — seen through, not hidden
  const pp = new THREE.MeshPhysicalMaterial({ color: 0xdfe8ee, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 0.6, envMapIntensity: 0.6 })
  const deck = new THREE.Mesh(slabWithHoles(W, T, DEP, [[0, 0, boreR]], 40), pp)
  deck.position.y = H - T; deck.castShadow = true; deck.receiveShadow = true; grp.add(deck)
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(LEG, H - T, DEP), pp)
    leg.position.set(sx * (W / 2 - LEG / 2), (H - T) / 2, 0); leg.castShadow = true; leg.receiveShadow = true; grp.add(leg)
  }
  // a coloured rim ring round the bore — reads as a moulded rack position
  const ring = new THREE.Mesh(new THREE.TorusGeometry(boreR + T * 0.25, T * 0.18, 10, 36), matPlastic(0x9fb4c4))
  ring.rotation.x = Math.PI / 2; ring.position.y = H; grp.add(ring)
  addSocket(grp, 'seat', { position: new THREE.Vector3(0, 0, 0) })
  grp.userData.sampleSocket = 'seat'
  grp.userData.holder = true                      // furniture that holds a vessel — never the step's subject
  return tagSpec(grp, id)
}

// A slab (width w, thickness h) spanning z0 … z1, split along z = zc through the centres of
// the bores `notchXs` (radius r): 'back' is z0 … zc with half-bores notched into its front
// edge, 'front' is zc … z1 with the other halves. Other bores (holes: [x, z, r]) sit whole in
// the back piece. Extruded up (+y) from 0 — as slabWithHoles.
function splitSlab(w, h, z0, zc, z1, notchXs, r, holes, part) {
  const sh = new THREE.Shape()                                  // shape (x, -z)
  const xs = [...notchXs].sort((a, b) => a - b)
  if (part === 'back') {
    sh.moveTo(-w / 2, -z0); sh.lineTo(w / 2, -z0); sh.lineTo(w / 2, -zc)
    for (const x of [...xs].reverse()) { sh.lineTo(x + r, -zc); sh.absarc(x, -zc, r, 0, Math.PI, false) }
    sh.lineTo(-w / 2, -zc); sh.lineTo(-w / 2, -z0)
    for (const [x, z, hr] of holes) { const hp = new THREE.Path(); hp.absarc(x, -z, hr, 0, Math.PI * 2, true); sh.holes.push(hp) }
  } else {
    sh.moveTo(-w / 2, -zc)
    for (const x of xs) { sh.lineTo(x - r, -zc); sh.absarc(x, -zc, r, Math.PI, Math.PI * 2, false) }
    sh.lineTo(w / 2, -zc); sh.lineTo(w / 2, -z1); sh.lineTo(-w / 2, -z1); sh.lineTo(-w / 2, -zc)
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 24 })
  g.rotateX(-Math.PI / 2)
  return g
}

// A PRE-CHILLED ALUMINIUM COOLING RACK — the stated "on ice" of a reaction set-up, and ONE
// rack for its reagents (not a stand per tube). A short row of 0.2 mL seats (the reaction,
// in 'rx'), a gap, then a row of 1.5 mL seats for the reagent tubes ('s0'…). The seats are
// REAL bores (a block with holes, floored at their stated depth). The block is split along
// its length through the centres of the 0.2 mL bores: the FRONT strip (with their front
// halves) is its near wall, cut away while a reaction sits in it — any solid face in front of
// a 21 mm tube seated 14 mm deep hid a third of it.
export function buildCoolRack() {
  const D = dims('cool_rack'), PT = dims('pcr_tube_0_2'), MT = dims('microtube_1_5')
  const W = D.width, DEP = D.depth, H = D.height, gap = clearance('socket_fit')
  const B2 = D.bore_depth_0_2, B15 = D.bore_depth_1_5
  const r2 = PT.radius + gap, r15 = MT.radius + gap
  const ZC = DEP * 0.1                                     // the split line: the 0.2 mL row's centres
  const ROWZ = ZC - r15 - r2                               // the 1.5 mL row, wholly behind it
  const x0 = -W / 2 + D.pitch_0_2 * 1.5                    // first 0.2 mL seat
  const seats2 = Array.from({ length: D.seats_0_2 }, (_, k) => x0 + k * D.pitch_0_2)
  const xs15 = seats2[seats2.length - 1] + D.gap + r15
  const seats15 = Array.from({ length: D.seats_1_5 }, (_, k) => xs15 + k * D.pitch_1_5)
  const alu = new THREE.MeshStandardMaterial({ color: 0xb4c3d2, metalness: 0.55, roughness: 0.38, envMapIntensity: 0.9 })   // cold-tinted aluminium
  const grp = new THREE.Group()
  const floorY = H - B15
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, floorY, DEP), alu)
  base.position.y = floorY / 2; base.castShadow = true; base.receiveShadow = true; grp.add(base)
  const top = new THREE.Mesh(splitSlab(W, B15, -DEP / 2, ZC, DEP / 2, seats2, r2, seats15.map((x) => [x, ROWZ, r15]), 'back'), alu)
  top.position.y = floorY; top.castShadow = true; grp.add(top)
  const front = new THREE.Mesh(splitSlab(W, B15, -DEP / 2, ZC, DEP / 2, seats2, r2, [], 'front'), alu)
  front.position.y = floorY; front.castShadow = true; grp.add(front)
  // the 0.2 mL bores are shallower: a plug floors each at its own depth
  const plugH = B15 - B2
  for (const x of seats2) {
    const plug = new THREE.Mesh(new THREE.CylinderGeometry(r2, r2, plugH, 20), alu)
    plug.position.set(x, floorY + plugH / 2, ZC); grp.add(plug)
  }
  seats2.forEach((x, k) => addSocket(grp, k === 0 ? 'rx' : 'p' + k, { position: new THREE.Vector3(x, H - B2, ZC), accepts: ['pcr_tube_0_2'] }))
  seats15.forEach((x, k) => addSocket(grp, 's' + k, { position: new THREE.Vector3(x, floorY, ROWZ), accepts: ['microtube_1_5'] }))
  grp.userData.sampleSocket = 'rx'
  grp.userData.sourceSockets = seats15.map((_, k) => 's' + k)
  grp.userData.holder = true; grp.userData.rack = true
  declareCutaway(grp, [front])
  return tagSpec(grp, 'cool_rack')
}
