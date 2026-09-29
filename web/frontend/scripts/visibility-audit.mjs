// visibility-audit.mjs — LEGIBILITY report: every station's SUBJECT seen through the
// station's own camera (area / occlusion / safe area; src/scene/visibilityAudit.js).
// Sibling of geometry-audit.mjs; same headless build.
//   npx vite-node scripts/visibility-audit.mjs [-- <protocol ids>] [-- --json]
import fs from 'fs'
import path from 'path'
import { installHeadless } from '../src/scene/headless.js'
installHeadless()
const { auditVisibility, summarizeVisibility, VIS_CHECKS } = await import('../src/scene/stationAudit.js')
const { VIS } = await import('../src/scene/visibilityAudit.js')

const argv = process.argv.slice(2).filter((a) => a !== '--')
const JSON_OUT = argv.includes('--json')
const only = argv.filter((a) => !a.startsWith('--'))
const DIR = path.join(process.cwd(), 'public', 'protocols')
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).filter((p) => !only.length || only.includes(p.id))
const results = index.map((m) => ({ id: m.id, stations: auditVisibility(JSON.parse(fs.readFileSync(path.join(DIR, m.file), 'utf8'))) }))
const { counts, rows } = summarizeVisibility(results)
const n = results.reduce((k, r) => k + r.stations.length, 0)
if (JSON_OUT) console.log(JSON.stringify({ stations: n, thresholds: VIS, counts, rows }, null, 2))
else {
  console.log(`\nbenchpilot visibility audit — ${results.length} protocols, ${n} stations`)
  console.log(`thresholds: area ≥ ${VIS.MIN_AREA * 100}% of frame · occluded ≤ ${VIS.MAX_OCCLUDED * 100}% · centre within |x| ≤ ${VIS.SAFE.x}, ${VIS.SAFE.bottom} ≤ y ≤ ${VIS.SAFE.top} (NDC)\n`)
  for (const c of VIS_CHECKS) {
    const rs = rows.filter((r) => r.check === c)
    console.log(`${rs.length ? '✗' : '✓'} ${c}: ${rs.length}`)
    for (const r of rs) console.log(`    ${r.protocol} step ${r.step} (${r.action}${r.equipment && r.equipment !== 'generic' ? ` on ${r.equipment}` : ''}) p=${r.p}: ${r.object} ${r.kind}${r.area != null ? ` ${(r.area * 100).toFixed(2)}%` : ''}${r.fraction != null ? ` ${(r.fraction * 100).toFixed(0)}% by ${r.by}` : ''}${r.ndc ? ` at ${r.ndc}` : ''}`)
  }
  console.log(`\nred counts (stations failing): ${VIS_CHECKS.map((c) => `${c} ${counts[c]}`).join(' · ')}\n`)
}
process.exitCode = rows.length ? 1 : 0
