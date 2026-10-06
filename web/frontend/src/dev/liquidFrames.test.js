// The frame checker must go red on each defect it claims to catch (synthetic frames).
import { describe, it, expect } from 'vitest'
import { checkFrames, checkBoundary } from './liquidFrames.js'

const V = (ul, color = '#112233', o = {}) => ({ ul, color, tipIn: false, tipBelow: false, spinning: false, ...o })
const F = (k, vessels, tip = { ul: 0, color: '#000000' }, streams = []) => ({ k, p: k / 10, vessels, tip, streams })

describe('checkFrames', () => {
  it('a: a level that moves with no transfer is red; one the tip draws from below its surface is not', () => {
    expect(checkFrames([F(0, { tube: V(100) }), F(1, { tube: V(99) })]).map((b) => b.check)).toContain('a')
    const ok = checkFrames([F(0, { tube: V(100, '#112233', { tipIn: true, tipBelow: true }) }), F(1, { tube: V(90, '#112233', { tipIn: true, tipBelow: true }) }, { ul: 10, color: '#112233' })])
    expect(ok).toEqual([])
  })
  it('a: drawing with the tip above the liquid is red', () => {
    const bad = checkFrames([F(0, { tube: V(100, '#112233', { tipIn: true }) }), F(1, { tube: V(90, '#112233', { tipIn: true }) }, { ul: 10, color: '#112233' })])
    expect(bad.some((b) => b.check === 'a' && /above the liquid/.test(b.detail))).toBe(true)
  })
  it('b: a colour change with nothing flowing in is red; a tip of another colour than its source is red', () => {
    expect(checkFrames([F(0, { tube: V(100, '#111111') }), F(1, { tube: V(100, '#222222') })]).map((b) => b.check)).toContain('b')
    const t = checkFrames([F(0, { b: V(1000, '#00ff00', { tipIn: true, tipBelow: true }) }), F(1, { b: V(990, '#00ff00', { tipIn: true, tipBelow: true }) }, { ul: 10, color: '#ff0000' })])
    expect(t.some((b) => b.vessel === 'tip')).toBe(true)
  })
  it('c: liquid appearing from nowhere is red', () => {
    expect(checkFrames([F(0, { tube: V(100, '#1', { spinning: true }) }), F(1, { tube: V(120, '#1', { spinning: true }) })]).map((b) => b.check)).toContain('c')
  })
  it('d: a jump across a station boundary is red', () => {
    expect(checkBoundary(F(0, { tube: V(350) }), F(0, { tube: V(300) })).length).toBe(1)
    expect(checkBoundary(F(0, { tube: V(350, '#1') }), F(0, { tube: V(350, '#2') })).length).toBe(1)
    expect(checkBoundary(F(0, { tube: V(350) }), F(0, { tube: V(350) }))).toEqual([])
  })
})
