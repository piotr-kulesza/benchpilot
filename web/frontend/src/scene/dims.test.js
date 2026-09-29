import { describe, it, expect } from 'vitest'
import { dims, clearance, provenanceRows, SOURCES, SPEC_IDS, WORLD_UNIT_MM } from './dims.js'

describe('dimensions table', () => {
  it('declares one world unit', () => {
    expect(WORLD_UNIT_MM).toBe(100)
  })

  it('every value carries exactly one provenance: src | est | derived', () => {
    const bad = provenanceRows().filter((r) => r.prov.length !== 1 || r.unit == null || typeof r.value !== 'number')
    expect(bad).toEqual([])
  })

  it('every src points at a listed source; every est says why', () => {
    const rows = provenanceRows()
    expect(rows.filter((r) => r.prov[0] === 'src' && !SOURCES[r.ref]).map((r) => `${r.owner}.${r.key}`)).toEqual([])
    expect(rows.filter((r) => r.prov[0] === 'est' && !(typeof r.ref === 'string' && r.ref.length > 8)).map((r) => `${r.owner}.${r.key}`)).toEqual([])
  })

  it('every item has a height and a footprint', () => {
    for (const id of SPEC_IDS) {
      const d = dims(id)
      expect(d.height, id).toBeGreaterThan(0)
      expect(d.width, id).toBeGreaterThan(0)
      expect(d.depth, id).toBeGreaterThan(0)
    }
  })

  it('converts mm to world units', () => {
    expect(dims('microtube_1_5').height).toBeCloseTo(0.41, 6)
    expect(dims('microplate_96').width).toBeCloseTo(1.2776, 6)
    expect(clearance('contact_epsilon')).toBeCloseTo(0.005, 6)
  })

  it('socket accept lists name real items', () => {
    for (const id of SPEC_IDS) for (const a of dims(id).accepts) expect(SPEC_IDS, `${id} accepts ${a}`).toContain(a)
  })
})
