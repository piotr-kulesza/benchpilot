// ScaleScene (?scale=1) — THE SCALE SHEET. Every registry model built fresh and stood side
// by side on ONE ground line (the bench, y=0), in order of height, under ONE fixed
// ORTHOGRAPHIC front camera (no perspective: equal sizes read equal anywhere on the sheet),
// with a RULER: a 500 mm post at the left with 10 mm ticks, and 100 mm bands along the
// ground under the whole line. Each model carries a caption: its id and its REAL
// dimensions from dimensions.json. One image where every scale error is visible at once.
import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Vector3 } from 'three'
import * as demo from '../scene/demoScene.js'
import { solidBox } from '../scene/solids.js'
import { spec, clearance, WORLD_UNIT_MM, mmToWorld } from '../scene/dims.js'
import { MODELS } from './registry.js'
import { Lights, useDevEnv, disposeGroup } from './DevScene.jsx'

const GAP = clearance('bench_gap') * 2

function realCaption(id) {
  const s = spec(id)
  if (!s) return ''
  const v = (k) => s[k] && s[k].mm
  const fp = v('diameter') ? `Ø${v('diameter')}` : `${v('width')}×${v('depth')}`
  return `${fp} × ${v('height')} mm`
}

// the ruler: a post of 10 mm bands (every 100 mm dark), 500 mm tall
function buildRuler(heightMm) {
  const g = new Group()
  const dark = new MeshBasicMaterial({ color: 0x1b1f25 }), light = new MeshBasicMaterial({ color: 0xe9edf1 }), tick = new MeshBasicMaterial({ color: 0xd9534f })
  const W = mmToWorld(12)
  for (let mm = 0; mm < heightMm; mm += 10) {
    const b = new Mesh(new BoxGeometry(W, mmToWorld(10), W), (mm / 10) % 2 ? dark : light)
    b.position.set(0, mmToWorld(mm + 5), 0); g.add(b)
    if (mm % 100 === 0) { const t = new Mesh(new BoxGeometry(W * 3, mmToWorld(1.5), W), tick); t.position.set(W * 1.5, mmToWorld(mm), 0.01); g.add(t) }
  }
  return g
}

export function ScaleScene() {
  useDevEnv()
  const { scene, size } = useThree()
  const built = useMemo(() => {
    const g = new Group()
    const items = MODELS.map((m) => { const node = m.build(); node.userData.update?.(0.001); node.traverse((o) => { if (o.isSprite) o.visible = false }); const b = solidBox(node, node); return { m, node, b } })
    items.sort((a, b) => (a.b.max.y - a.b.min.y) - (b.b.max.y - b.b.min.y))
    // TWO ROWS under the same camera (same scale): the short half and the tall half, each on
    // its own ground line with its own ruler; the upper row stands on a line drawn above the
    // lower row's tallest model
    const widthOf = (it) => it.b.max.x - it.b.min.x
    const total = items.reduce((n, it) => n + widthOf(it) + GAP, 0)
    const rows = [[], []]; let acc = 0
    for (const it of items) { (acc < total / 2 ? rows[0] : rows[1]).push(it); acc += widthOf(it) + GAP }
    const bandMat = [new MeshBasicMaterial({ color: 0x1b1f25 }), new MeshBasicMaterial({ color: 0xe9edf1 })]
    let baseY = 0, maxX = 0, k = 0
    const rowTall = rows.map((r) => Math.max(mmToWorld(500), ...r.map((it) => it.b.max.y)))
    // the tall row sits at the bottom, the short row above it
    ;[rows[1], rows[0]].forEach((row, ri) => {
      const ruler = buildRuler(500)
      let x = 0
      ruler.position.set(x, baseY, 0); g.add(ruler); x += mmToWorld(40) + GAP
      for (const { m, node, b } of row) {
        const w = widthOf({ b })
        node.position.set(x - b.min.x, baseY, -(b.min.z + b.max.z) / 2)
        g.add(node)
        const specId = node.userData.spec
        const cap = demo.makeLabel(m.id, specId ? realCaption(specId) : 'assembly: tank + power supply')
        cap.scale.multiplyScalar(0.9)
        cap.position.set(x + w / 2, baseY + b.max.y + 0.25 + (k++ % 3) * 0.42, 0.5)
        g.add(cap)
        x += w + GAP
      }
      // ground line + 100 mm bands under the row
      for (let q = 0; q * 0.1 < x; q++) {
        const band = new Mesh(new BoxGeometry(0.1, mmToWorld(4), mmToWorld(20)), bandMat[q % 2])
        band.position.set(q * 0.1 + 0.05, baseY + mmToWorld(2), mmToWorld(400)); g.add(band)
      }
      if (ri === 0) {
        const line = new Mesh(new BoxGeometry(x, mmToWorld(4), mmToWorld(600)), new MeshBasicMaterial({ color: 0x3a3f47 }))
        line.position.set(x / 2, rowTall[1] + 1.6 - mmToWorld(2), 0); g.add(line)   // the upper row's ground
      }
      maxX = Math.max(maxX, x)
      baseY = rowTall[1] + 1.6
    })
    const tallest = baseY + rowTall[0]
    g.userData.bounds = { minX: -0.3, maxX, maxY: tallest + 1.4 }
    return g
  }, [])
  useEffect(() => { scene.add(built); return () => { scene.remove(built); disposeGroup(built) } }, [scene, built])
  const floor = useMemo(() => demo.buildFloor(built.userData.bounds.maxX), [built])
  useEffect(() => { scene.add(floor); return () => { scene.remove(floor); disposeGroup(floor) } }, [scene, floor])

  // one fixed orthographic front camera fitting the whole line
  const { minX, maxX, maxY } = built.userData.bounds
  const cx = (minX + maxX) / 2, cy = maxY / 2 - 0.1
  const zoom = Math.min(size.width / (maxX - minX + 0.6), size.height / (maxY + 0.6))
  return (
    <>
      <Lights />
      <OrthographicCamera makeDefault position={[cx, cy, 40]} zoom={zoom} near={0.1} far={200} onUpdate={(c) => c.lookAt(cx, cy, 0)} />
    </>
  )
}

export const SCALE_WORLD_UNIT_MM = WORLD_UNIT_MM
