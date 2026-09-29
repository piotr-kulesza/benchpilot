// solids.js — which meshes of a model are RIGID SOLIDS (the things that must rest on,
// sit in and not pass through one another), and their bounding box. Pure three.js.
//
// Excluded: sprites (labels), lights, invisible meshes, and meshes tagged userData.fx
// (fluid / effect / decal / granular — see fx() in demoScene.js).
import { Box3, Matrix4, Vector3 } from 'three'

function effectivelyVisible(o, root) {
  for (let n = o; n; n = n.parent) { if (!n.visible) return false; if (n === root) break }
  return true
}

export function isSolidMesh(o) {
  return !!(o.isMesh && o.geometry && !(o.userData && o.userData.fx))
}

// every solid mesh under root (visible, un-tagged)
export function solidMeshes(root) {
  const out = []
  root.traverse((o) => { if (isSolidMesh(o) && effectivelyVisible(o, root)) out.push(o) })
  return out
}

const _m = new Matrix4()
const _b = new Box3()
const _v = new Vector3()
// Bounding box of root's solids, in WORLD space (relativeTo = null) or in the frame of
// `relativeTo` (e.g. root itself → its own local frame, for a pivot / canonical size).
export function solidBox(root, relativeTo = null) {
  root.updateWorldMatrix(true, true)
  const box = new Box3()
  const inv = relativeTo ? new Matrix4().copy(relativeTo.matrixWorld).invert() : null
  for (const m of solidMeshes(root)) {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    if (m.isInstancedMesh) {
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, _m); _m.premultiply(m.matrixWorld); if (inv) _m.premultiply(inv)
        box.union(_b.copy(m.geometry.boundingBox).applyMatrix4(_m))
      }
    } else {
      // PRECISE: transform every vertex (a rotated box's AABB is not the vertices' AABB,
      // and a contact check needs the true lowest point)
      _m.copy(m.matrixWorld); if (inv) _m.premultiply(inv)
      const pos = m.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) box.expandByPoint(_v.fromBufferAttribute(pos, i).applyMatrix4(_m))
    }
  }
  return box
}
