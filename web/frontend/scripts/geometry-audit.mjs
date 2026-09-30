// geometry-audit.mjs — contact / containment / interpenetration / relative-scale report over
// EVERY station of every bundled protocol, plus the pivot audit of every model. Builds the
// real stations headless (no browser, no GPU). Sibling of schema-audit.mjs.
//
//   npx vite-node scripts/geometry-audit.mjs              # summary + defect list
//   npx vite-node scripts/geometry-audit.mjs -- --json    # machine-readable
//   npx vite-node scripts/geometry-audit.mjs -- pcr       # one protocol
// (vite-node, because the station code is JSX.) Exit 1 when any check is red.
import fs from 'fs'
import path from 'path'
import { installHeadless } from '../src/scene/headless.js'
installHeadless()
const { auditProtocol, summarize, applyExceptions, CHECKS } = await import('../src/scene/stationAudit.js')
const EXC = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'scene', 'geometry-exceptions.json'), 'utf8'))
const { pivotDefect } = await import('../src/scene/geometryAudit.js')
const { MODELS } = await import('../src/dev/registry.js')
const demo = await import('../src/scene/demoScene.js')

const argv = process.argv.slice(2).filter((a) => a !== '--')
const JSON_OUT = argv.includes('--json')
const only = argv.filter((a) => !a.startsWith('--'))
const DIR = path.join(process.cwd(), 'public', 'protocols')
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).filter((p) => !only.length || only.includes(p.id))

const results = []
for (const meta of index) {
  const protocol = JSON.parse(fs.readFileSync(path.join(DIR, meta.file), 'utf8'))
  results.push({ id: meta.id, stations: auditProtocol(protocol) })
}
const all = summarize(results)
const { rows, accepted, stale } = applyExceptions(all.rows, EXC.exceptions, results.map((r) => r.id))
const counts = Object.fromEntries(CHECKS.map((c) => [c, rows.filter((r) => r.check === c).length]))
demo.buildSharedMaps()
const pivots = MODELS.map((m) => ({ id: m.id, issues: pivotDefect(m.build()) })).filter((r) => r.issues)
const steps = results.reduce((n, r) => n + r.stations.length, 0)

if (JSON_OUT) {
  console.log(JSON.stringify({ steps, counts, pivots, rows, accepted, stale }, null, 2))
} else {
  console.log(`\nbenchpilot geometry audit — ${results.length} protocols, ${steps} stations\n`)
  const fmt = (d) => {
    const where = `${d.protocol} step ${d.step} (${d.action}${d.equipment && d.equipment !== 'generic' ? ` on ${d.equipment}` : ''}, ${d.container}) p=${d.p}`
    if (d.check === 'contact') return `${where}: ${d.object} ${d.kind}${d.on ? ` above ${d.on}` : ''}${d.into ? ` into ${d.into}` : ''} ${d.gap ?? d.depth}`
    if (d.check === 'stability') return `${where}: ${d.object} stands ${d.kind} on the ${d.on} (base spans ${(d.span * 100).toFixed(0)}% of its footprint)`
    if (d.check === 'containment') return `${where}: ${d.object} in ${d.host} — ${d.kind}`
    if (d.check === 'interpenetration') return `${where}: ${d.a} ∩ ${d.b}`
    return `${where}: ${d.a} vs ${d.b} — off real ratio ×${d.ratioOff}`
  }
  for (const c of CHECKS) {
    const rs = rows.filter((r) => r.check === c)
    console.log(`${rs.length ? '✗' : '✓'} ${c}: ${rs.length}`)
    for (const r of rs.slice(0, 400)) console.log(`    ${fmt(r)}`)
  }
  console.log(`\npivot convention (origin = centre of base): ${pivots.length} of ${MODELS.length} models violate`)
  for (const p of pivots) console.log(`    ${p.id}: ${p.issues.join('; ')}`)
  if (accepted.length || stale.length) {
    console.log(`\naccepted exceptions (src/scene/geometry-exceptions.json) — NOT counted`)
    for (const a of accepted) console.log(`    ${a.protocol} step ${a.step} p=${a.p}: ${a.object} ${a.kind} by ${a.host} (since ${a.exception.added}; clears when ${a.exception.clears_when})`)
    for (const e of stale) console.log(`    ✗ STALE: ${e.protocol} step ${e.step} ${e.check}/${e.kind} no longer occurs — delete it (counted as a failure)`)
  }
  console.log(`\nred counts: ${CHECKS.map((c) => `${c} ${counts[c]}`).join(' · ')} · pivot ${pivots.length}\n`)
}
process.exitCode = rows.length || pivots.length || stale.length ? 1 : 0
