// LEGIBILITY of every station of every bundled protocol, as tests (visibilityAudit.js):
// the subject — the thing the step acts on — must be big enough in frame, not hidden,
// and centred clear of the edges and the top HUD band.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { installHeadless } from './headless.js'
installHeadless()

const DIR = path.join(process.cwd(), 'public', 'protocols')
const INDEX = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'))
let rows
beforeAll(async () => {
  const { auditVisibility, summarizeVisibility } = await import('./stationAudit.js')
  const results = INDEX.map((m) => ({ id: m.id, stations: auditVisibility(JSON.parse(fs.readFileSync(path.join(DIR, m.file), 'utf8'))) }))
  rows = summarizeVisibility(results).rows
}, 120000)
const fmt = (c) => rows.filter((r) => r.check === c).map((r) => `${r.protocol}#${r.step} p=${r.p} ${r.object} ${r.kind}`)

describe('legibility — the subject of every station', () => {
  it('area: the subject covers at least MIN_AREA of the frame (and is in it)', () => { expect(fmt('area')).toEqual([]) })
  it('occlusion: no more than MAX_OCCLUDED of the subject is hidden behind anything opaque', () => { expect(fmt('occlusion')).toEqual([]) })
  it('safe area: the subject centre is clear of the frame edges and the top HUD band', () => { expect(fmt('safeArea')).toEqual([]) })
})
