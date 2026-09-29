// The geometry of EVERY station of every bundled protocol, as tests (see geometryAudit.js).
// Each check must be zero. The pivot convention covers every model in the registry.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { installHeadless } from './headless.js'
installHeadless()

const DIR = path.join(process.cwd(), 'public', 'protocols')
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'))
let summary, pivots, fmt

beforeAll(async () => {
  const { auditProtocol, summarize } = await import('./stationAudit.js')
  const { pivotDefect } = await import('./geometryAudit.js')
  const { MODELS } = await import('../dev/registry.js')
  const results = index.map((m) => ({ id: m.id, stations: auditProtocol(JSON.parse(fs.readFileSync(path.join(DIR, m.file), 'utf8'))) }))
  summary = summarize(results)
  pivots = MODELS.map((m) => ({ id: m.id, issues: pivotDefect(m.build()) })).filter((r) => r.issues)
  fmt = (check) => summary.rows.filter((r) => r.check === check).map((r) => `${r.protocol}#${r.step} ${r.kind || ''} ${r.object || r.a} ${r.host || r.into || r.on || r.b || ''}`.trim())
}, 120000)

describe('scene geometry — every station', () => {
  it('contact: every resting object sits on the surface beneath it (no float, no sink)', () => {
    expect(fmt('contact')).toEqual([])
  })
  it('containment: a vessel in an instrument is in a socket that accepts it, never through a wall', () => {
    expect(fmt('containment')).toEqual([])
  })
  it('interpenetration: no two solids intersect', () => {
    expect(fmt('interpenetration')).toEqual([])
  })
  it('relative scale: objects in one frame keep their real-world size ratio', () => {
    expect(fmt('relativeScale')).toEqual([])
  })
  it('pivot: every model is built with its origin at the centre of its base', () => {
    expect(pivots.map((p) => `${p.id}: ${p.issues.join('; ')}`)).toEqual([])
  })
})
