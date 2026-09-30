// holders.js — what a vessel with a NON-FLAT base stands in on the open bench. A conical
// 1.5 mL tube cannot stand on its tip (geometryAudit: stability); in a lab it stands in a
// rack. REAL SIZE from dims('tube_stand').
import * as THREE from 'three'
import { dims, clearance } from './dims.js'
import { addSocket } from './sockets.js'
import { matPlastic } from './materials.js'
import { slabWithHoles, tagSpec } from './modelKit.js'

// An OPEN-FRAME stand: a bored deck on two end legs, open underneath and at the front and
// back — the tube's tip rests on the bench through the open floor (so its base centre, its
// origin, is at y = 0: the socket point), the deck holds its straight body upright, and its
// contents stay in view (a solid block would hide the pellet).
export function buildTubeStand() {
  const D = dims('tube_stand')
  const W = D.width, DEP = D.depth, H = D.height, T = D.deck_thickness, LEG = D.leg
  // the bore takes the widest vessel it accepts, plus the socket play
  const boreR = Math.max(...D.accepts.map((s) => dims(s).radius)) + clearance('socket_fit')
  const grp = new THREE.Group()
  const pp = matPlastic(0xe6ecf0)                 // natural polypropylene
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
  return tagSpec(grp, 'tube_stand')
}
