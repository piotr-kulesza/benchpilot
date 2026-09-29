// The geometry of EVERY station of the bundled protocols, as Vitest tests (see
// geometryAudit.js). Split across several test files (each audits a slice of the protocols)
// so Vitest runs them in parallel. Each check must be zero after the accepted, dated
// exceptions in geometry-exceptions.json; an exception that matches nothing fails.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { installHeadless } from './headless.js'
import EXC from './geometry-exceptions.json' with { type: 'json' }
installHeadless()

const DIR = path.join(process.cwd(), 'public', 'protocols')
const INDEX = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'))

export function defineGeometrySuite(ids, { pivots = false } = {}) {
  const metas = INDEX.filter((m) => ids.includes(m.id))
  let out, piv
  beforeAll(async () => {
    const { auditProtocol, summarize, applyExceptions } = await import('./stationAudit.js')
    const results = metas.map((m) => ({ id: m.id, stations: auditProtocol(JSON.parse(fs.readFileSync(path.join(DIR, m.file), 'utf8'))) }))
    out = applyExceptions(summarize(results).rows, EXC.exceptions, ids)
    if (pivots) {
      const { pivotDefect } = await import('./geometryAudit.js')
      const { MODELS } = await import('../dev/registry.js')
      piv = MODELS.map((m) => ({ id: m.id, issues: pivotDefect(m.build()) })).filter((r) => r.issues)
    }
  }, 600000)
  const fmt = (check) => out.rows.filter((r) => r.check === check).map((r) => `${r.protocol}#${r.step} p=${r.p} ${r.kind || ''} ${r.object || r.a} ${r.host || r.into || r.on || r.b || ''}`.trim())
  describe(`scene geometry — every station of ${ids.join(', ')}`, () => {
    it('contact: every resting object sits on what is beneath it, or on its socket (no float, no sink)', () => { expect(fmt('contact')).toEqual([]) })
    it('containment: a vessel in an instrument is in a socket that accepts it, never through a wall', () => { expect(fmt('containment')).toEqual([]) })
    it('interpenetration: no two solids intersect', () => { expect(fmt('interpenetration')).toEqual([]) })
    it('relative scale: objects in one frame keep their real-world size ratio', () => { expect(fmt('relativeScale')).toEqual([]) })
    it('no stale accepted exceptions', () => { expect(out.stale).toEqual([]) })
    if (pivots) it('pivot: every model is built with its origin at the centre of its base', () => { expect(piv.map((p) => `${p.id}: ${p.issues.join('; ')}`)).toEqual([]) })
  })
}
