// collisionAudit.test.js — the check must go RED on what it exists to catch, and stay green
// on what is legitimate (a rest contact, a tip inside a hollow tube, a held tool).
import { describe, it, expect } from 'vitest'
import { Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, LatheGeometry, Vector2, MeshStandardMaterial, Group } from 'three'
import { auditPose, penetration, TOL } from './collisionAudit.js'

const mat = new MeshStandardMaterial()
const box = (w, h, d, x = 0, y = h / 2, z = 0) => { const m = new Mesh(new BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.updateMatrixWorld(true); return m }
// a hollow tube with a real wall (outer and inner surface, closed at the bottom)
function tube(r = 0.1, h = 0.5, wall = 0.01, x = 0) {
  const p = [new Vector2(0, 0), new Vector2(r, 0), new Vector2(r, h), new Vector2(r - wall, h), new Vector2(r - wall, wall), new Vector2(0, wall)]
  const m = new Mesh(new LatheGeometry(p, 32), mat); m.position.set(x, 0, 0); m.updateMatrixWorld(true); return m
}
const tip = (x, yTip, len = 0.4, r = 0.02) => { const g = new ConeGeometry(r, len, 16); g.rotateX(Math.PI); g.translate(0, len / 2, 0); const m = new Mesh(g, mat); m.position.set(x, yTip, 0); m.updateMatrixWorld(true); return m }
const obj = (name, root, held = false) => ({ name, root, held })
const checks = (r) => r.defects.map((d) => d.check)

describe('collision audit · goes red on a deliberately overlapped pair', () => {
  it('two boxes overlapping by 0.05 → intersect, depth ≈ 0.05', () => {
    const a = box(0.4, 0.4, 0.4, 0), b = box(0.4, 0.4, 0.4, 0.35)
    const r = auditPose([obj('A', a), obj('B', b)])
    const d = r.defects.find((x) => x.check === 'intersect')
    expect(d, JSON.stringify(r.defects)).toBeTruthy()
    expect(d.depth).toBeGreaterThan(0.04); expect(d.depth).toBeLessThan(0.06)
  })
  it('the same boxes apart, or just touching → green', () => {
    expect(checks(auditPose([obj('A', box(0.4, 0.4, 0.4, 0)), obj('B', box(0.4, 0.4, 0.4, 0.5))]))).toEqual([])
    expect(checks(auditPose([obj('A', box(0.4, 0.4, 0.4, 0)), obj('B', box(0.4, 0.4, 0.4, 0.4))]))).toEqual([])
  })
  it('a pipette tip inside a hollow tube → green; pushed through its wall → red', () => {
    expect(penetration(tip(0, 0.1), tube())).toBe(0)
    expect(checks(auditPose([obj('tube', tube()), obj('pipette', tip(0, 0.1), true)]))).toEqual([])
    // the tip 0.03 off-axis at a tube of radius 0.1: crosses the wall
    const t = tip(0.095, 0.2)
    const r = auditPose([obj('tube', tube()), obj('pipette', t, true)])
    expect(checks(r)).toContain('intersect')
  })
  it('face winding does not matter (double-sided glass, lathes wound either way)', () => {
    const t = tube(); const idx = t.geometry.index.array
    for (let i = 0; i < idx.length; i += 3) { const k = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = k }
    expect(penetration(tip(0, 0.1), t)).toBe(0)
    expect(penetration(tip(0.095, 0.2), t)).toBeGreaterThan(TOL.depth)
  })
  it('a box held 0.2 above the bench, touching nothing, at rest → float; held, or only paused → green', () => {
    // resting from the first pose it was seen in (frame 0) to frame 60 → float; one pose alone has not rested yet
    const f = box(0.2, 0.2, 0.2, 0, 0.3)
    expect(checks(auditPose([obj('B', f)], { frame: 60 }))).toEqual([])
    expect(checks(auditPose([obj('B', f)], { frame: 60, prev: auditPose([obj('B', f)], { frame: 0 }).state }))).toEqual(['float'])
    const h = box(0.2, 0.2, 0.2, 0, 0.3)
    expect(checks(auditPose([obj('B', h, true)], { frame: 60, prev: auditPose([obj('B', h, true)], { frame: 0 }).state }))).toEqual([])
    // it was moving at frame 50: at frame 60 it has rested only 10 frames — the top of an arc
    const b = new Group(); b.add(box(0.2, 0.2, 0.2, 0, 0.3)); b.updateMatrixWorld(true)
    const r0 = auditPose([obj('B', b)], { frame: 40 }); b.position.x = 0.1; b.updateMatrixWorld(true)
    const r1 = auditPose([obj('B', b)], { frame: 50, prev: r0.state })
    expect(checks(auditPose([obj('B', b)], { frame: 60, prev: r1.state }))).toEqual([])
  })
  it('fluids, granular fills and effects are not solids; a fluid through its own vessel wall is', () => {
    const water = box(0.4, 0.4, 0.4); water.userData.auditKind = 'fluid'
    expect(checks(auditPose([obj('bath water', water), obj('tube', box(0.1, 0.3, 0.1, 0, 0.15))]))).toEqual([])
    const ice = box(0.4, 0.2, 0.4); ice.material = ice.material.clone(); ice.material.userData.auditKind = 'granular'
    expect(checks(auditPose([obj('ice', ice), obj('tube', box(0.1, 0.3, 0.1, 0, 0.15))]))).toEqual([])
    const v = new Group(), wall = tube(), liq = new Mesh(new CylinderGeometry(0.1, 0.1, 0.2, 24), mat); liq.userData.auditKind = 'fluid'
    liq.position.y = 0.2; v.add(wall); v.add(liq); v.updateMatrixWorld(true)
    const r0 = auditPose([obj('tube', v)])                                   // the liquid fills the bore
    liq.scale.set(1.3, 1, 1.3); v.updateMatrixWorld(true)                     // swells through the wall
    expect(checks(auditPose([obj('tube', v)], { prev: r0.state }))).toContain('intersect')
  })
  it('a box resting on another box is supported → green; one sunk into the bench → sunk', () => {
    expect(checks(auditPose([obj('base', box(0.4, 0.2, 0.4)), obj('top', box(0.2, 0.2, 0.2, 0, 0.3))]))).toEqual([])
    const r = auditPose([obj('B', box(0.2, 0.2, 0.2, 0, 0.05))])
    expect(checks(r)).toEqual(['sunk']); expect(r.defects[0].depth).toBeCloseTo(0.05, 3)
  })
  it('a box carried THROUGH a wall between two frames → sweep (and it is not "floating": it moves)', () => {
    const wall = box(0.02, 0.6, 0.6, 0.3), mover = new Group(), body = box(0.1, 0.1, 0.1, 0, 0.3); mover.add(body)
    mover.position.set(0, 0, 0); mover.updateMatrixWorld(true)
    const r0 = auditPose([obj('wall', wall), obj('mover', mover)])
    mover.position.set(0.6, 0, 0); mover.updateMatrixWorld(true)          // jumped past the wall in one frame
    const r1 = auditPose([obj('wall', wall), obj('mover', mover)], { prev: r0.state })
    expect(checks(r1)).toContain('sweep')
    expect(checks(r1)).not.toContain('float')
  })
  it('a lid closing through its own body → intersect (moving part × body)', () => {
    const dev = new Group(), body = box(0.6, 0.3, 0.6), lid = box(0.6, 0.04, 0.6, 0, 0.32); dev.add(body); dev.add(lid); dev.updateMatrixWorld(true)
    const r0 = auditPose([obj('dev', dev)])
    lid.position.y = 0.25; dev.updateMatrixWorld(true)                       // the lid sinks 0.07 into the body
    const r1 = auditPose([obj('dev', dev)], { prev: r0.state })
    const d = r1.defects.find((x) => x.check === 'intersect')
    expect(d, JSON.stringify(r1.defects)).toBeTruthy()
    expect(d.a).toMatch(/moving part/)
  })
  it('a part overlapping its body BY DESIGN at rest, moving no deeper → green', () => {
    const dev = new Group(), body = box(0.6, 0.3, 0.6), cap = box(0.2, 0.1, 0.2, 0, 0.28); dev.add(body); dev.add(cap); dev.updateMatrixWorld(true)
    const r0 = auditPose([obj('dev', dev)])                                 // the cap sits 0.02 into the body
    cap.position.x = 0.05; dev.updateMatrixWorld(true)                       // slides, no deeper
    expect(checks(auditPose([obj('dev', dev)], { prev: r0.state }))).toEqual([])
  })
  it('a vessel docked INSIDE an instrument is its own object, not part of it', () => {
    const dev = new Group(), well = box(0.6, 0.3, 0.6); dev.add(well)
    const v = new Group(); v.add(box(0.1, 0.1, 0.1, 0, 0.35)); dev.add(v); dev.updateMatrixWorld(true)
    const r = auditPose([obj('dev', dev), obj('vessel', v)])
    expect(checks(r)).toEqual([])
  })
  it('wholly inside a see-through closed container is fine; through its wall is not', () => {
    const tank = box(1, 0.6, 1); tank.material = new MeshStandardMaterial({ transparent: true, opacity: 0.4 })
    expect(checks(auditPose([obj('tank', tank), obj('gel', box(0.4, 0.1, 0.4, 0, 0.05))]))).toEqual([])
    expect(checks(auditPose([obj('tank', tank), obj('gel', box(0.4, 0.1, 0.4, 0.45, 0.05))]))).toContain('intersect')
  })
  it('tolerances are stated', () => { expect(TOL.depth).toBeGreaterThan(0) })
})
