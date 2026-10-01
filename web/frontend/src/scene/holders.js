// holders.js — what a vessel with a NON-FLAT base stands in on the open bench. A conical
// 1.5 mL tube cannot stand on its tip (geometryAudit: stability); in a lab it stands in a
// rack. REAL SIZE from dims('tube_stand').
import * as THREE from 'three'
import { streams } from './rng.js'
import { dims, clearance } from './dims.js'
import { addSocket } from './sockets.js'
import { matPlastic } from './materials.js'
import { declareCutaway, fitArt, fx, slabWithHoles, tagSpec } from './modelKit.js'

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
function splitSlab(w, h, z0, zc, z1, notchXs, r, holes, part, xa = -w / 2, xb = w / 2) {
  const sh = new THREE.Shape()                                  // shape (x, -z)
  const xs = [...notchXs].sort((a, b) => a - b)
  if (part === 'back') {
    sh.moveTo(-w / 2, -z0); sh.lineTo(w / 2, -z0); sh.lineTo(w / 2, -zc)
    for (const x of [...xs].reverse()) { sh.lineTo(x + r, -zc); sh.absarc(x, -zc, r, 0, Math.PI, false) }
    sh.lineTo(-w / 2, -zc); sh.lineTo(-w / 2, -z0)
    for (const [x, z, hr] of holes) { const hp = new THREE.Path(); hp.absarc(x, -z, hr, 0, Math.PI * 2, true); sh.holes.push(hp) }
  } else {                                                      // the front piece over x ∈ [xa, xb]
    sh.moveTo(xa, -zc)
    for (const x of xs.filter((x) => x > xa && x < xb)) { sh.lineTo(x - r, -zc); sh.absarc(x, -zc, r, Math.PI, Math.PI * 2, false) }
    sh.lineTo(xb, -zc); sh.lineTo(xb, -z1); sh.lineTo(xa, -z1); sh.lineTo(xa, -zc)
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
  // the BASE: under the 1.5 mL seats it floors them at floorY; under the 0.2 mL section it
  // rises to their shallower floor (H − B2) — a solid block, not a plug per bore (seen through
  // the cut front strip, plugs stood round the reaction tube like posts)
  const xSplit = (seats2[seats2.length - 1] + xs15) / 2
  const w2 = xSplit + W / 2, w15 = W / 2 - xSplit
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(w2, H - B2, DEP), alu)
  base2.position.set(-W / 2 + w2 / 2, (H - B2) / 2, 0); base2.castShadow = true; base2.receiveShadow = true; grp.add(base2)
  const base15 = new THREE.Mesh(new THREE.BoxGeometry(w15, floorY, DEP), alu)
  base15.position.set(W / 2 - w15 / 2, floorY / 2, 0); base15.castShadow = true; base15.receiveShadow = true; grp.add(base15)
  // the slab above: over the 0.2 mL section only the part above their floor
  const top = new THREE.Mesh(splitSlab(W, B15, -DEP / 2, ZC, DEP / 2, seats2, r2, seats15.map((x) => [x, ROWZ, r15]), 'back'), alu)
  top.position.y = floorY; top.castShadow = true; grp.add(top)
  // the front strip in TWO: only the part in front of the reaction seat is the near wall
  // (cut away); the rest stays solid, so the other seats read as wells, not as the bore
  // walls of a see-through block standing up like cans
  const xCut = seats2[0] + D.pitch_0_2 / 2
  const front = new THREE.Mesh(splitSlab(W, B15, -DEP / 2, ZC, DEP / 2, seats2, r2, [], 'front', -W / 2, xCut), alu)
  front.position.y = floorY; front.castShadow = true; grp.add(front)
  const frontRest = new THREE.Mesh(splitSlab(W, B15, -DEP / 2, ZC, DEP / 2, seats2, r2, [], 'front', xCut, W / 2), alu)
  frontRest.position.y = floorY; frontRest.castShadow = true; grp.add(frontRest)
  // WELLS: each bore dark-lined and floored, so it reads as a hole in the block
  const well = new THREE.MeshStandardMaterial({ color: 0x1d232b, metalness: 0.4, roughness: 0.7, side: THREE.DoubleSide })
  const lineBore = (x, z, r, top, depth) => {
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.99, r * 0.99, depth, 24, 1, true), well)
    wall.position.set(x, top - depth / 2, z); fx(wall, 'decal'); grp.add(wall)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r * 0.99, 24), well)
    floor.rotation.x = -Math.PI / 2; floor.position.set(x, top - depth + 0.0005, z); fx(floor, 'decal'); grp.add(floor)
  }
  seats2.forEach((x, k) => { if (k > 0) lineBore(x, ZC, r2, H, B2) })   // (not the reaction's own seat: seen through the cut, its lining would hide the tube)
  seats15.forEach((x) => lineBore(x, ROWZ, r15, H, B15))
  seats2.forEach((x, k) => addSocket(grp, k === 0 ? 'rx' : 'p' + k, { position: new THREE.Vector3(x, H - B2, ZC), accepts: ['pcr_tube_0_2'] }))
  seats15.forEach((x, k) => addSocket(grp, 's' + k, { position: new THREE.Vector3(x, floorY, ROWZ), accepts: ['microtube_1_5'] }))
  grp.userData.sampleSocket = 'rx'
  grp.userData.sourceSockets = seats15.map((_, k) => 's' + k)
  grp.userData.holder = true; grp.userData.rack = true
  declareCutaway(grp, [front])
  return tagSpec(grp, 'cool_rack')
}

// AN ICE PAN — the stated "on ice", visibly: a shallow pan with crushed ice packed round the
// cooling rack standing on its floor ('bed'). The pan's walls stay below the seated tubes.
export function buildIcePan() {
  const D = dims('ice_pan'), R = dims('cool_rack')
  const W = D.width, DEP = D.depth, H = D.height, T = D.wall
  const grp = new THREE.Group()
  const pe = matPlastic(0xeef1f3)                        // white polyethylene
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, T, DEP), pe)
  floor.position.y = T / 2; floor.receiveShadow = true; floor.castShadow = true; grp.add(floor)
  ;[[W, H, T, 0, (DEP - T) / 2], [W, H, T, 0, -(DEP - T) / 2], [T, H, DEP - 2 * T, (W - T) / 2, 0], [T, H, DEP - 2 * T, -(W - T) / 2, 0]].forEach((r) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(r[0], r[1], r[2]), pe); m.position.set(r[3], r[1] / 2, r[4]); m.castShadow = true; grp.add(m)
  })
  // the rack's seat: on the floor, one contact tolerance up (it stands on the floor, never in it)
  addSocket(grp, 'bed', { position: new THREE.Vector3(0, T + clearance('contact_epsilon'), 0), accepts: ['cool_rack'] })
  // CRUSHED ICE packed round the rack's footprint (not under it), level to ice_depth: a bed of
  // small white pieces filling the pan, not a few clear lumps sunk below its rim (90 tries
  // at 9 mm, 55 % opaque and under the wall's top: from the bench it read as nothing)
  const iceMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f0f5, roughness: 0.32, transparent: true, opacity: 0.9, clearcoat: 0.6, envMapIntensity: 0.9, flatShading: true })
  const rw = R.width / 2 + 0.002, rd = R.depth / 2 + 0.002, top = T + D.ice_depth
  const N = Math.round(D.ice_pieces), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
  const poses = []
  for (let i = 0; i < N; i++) {
    const cs = D.ice_piece * (0.3 + Math.random() * 0.22)
    const x = (Math.random() - 0.5) * (W - 2 * T - 2 * cs), z = (Math.random() - 0.5) * (DEP - 2 * T - 2 * cs)
    const y = top - cs * (0.2 + Math.random() * 1.2), sy = 0.7 + Math.random() * 0.3     // packed: tops at the bed's level, more below
    e.set(Math.random(), Math.random(), Math.random())
    if (Math.abs(x) < rw + cs && Math.abs(z) < rd + cs) continue           // the rack stands there
    poses.push(m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e), new THREE.Vector3(cs, cs * sy, cs)).clone())
  }
  // ONE instanced mesh (a few hundred pieces, one draw call)
  const ice = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), iceMat, poses.length)
  poses.forEach((m, k) => ice.setMatrixAt(k, m))
  ice.castShadow = true; ice.receiveShadow = true; fx(ice, 'granular'); grp.add(ice)
  grp.userData.sampleSocket = 'bed'
  grp.userData.holder = true
  return tagSpec(grp, 'ice_pan')
}
// per-builder seeded random stream (the ice pieces) — deterministic captures
buildIcePan = streams.wrap('buildIcePan', buildIcePan)
