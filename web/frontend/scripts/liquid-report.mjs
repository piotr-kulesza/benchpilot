// The liquid ledger, printed: every station's vessels at start → end, its ops, and every volume
// the text does not determine. Pure node (no browser):
//   npx vite-node scripts/liquid-report.mjs [--protocols neutrophil_rna,pcr] [--md out.md]
import fs from 'node:fs'
import path from 'node:path'
import { buildLedger, fmt } from '../src/vessel/liquidLedger.js'
import { sampleContainerSequence } from '../src/vessel/sceneRecipe.js'
import { reagentColor } from '../src/vessel/theme.js'
import { partitionSteps } from '../src/lib/runtime.js'

const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null }
const DIR = path.resolve('public/protocols')
const only = arg('protocols') ? arg('protocols').split(',') : null
const ids = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).map((p) => p.id || p).filter((id) => !only || only.includes(id))
const hex = (c) => '#' + (c ?? 0).toString(16).padStart(6, '0')
const out = []
const say = (s = '') => { out.push(s); console.log(s) }
for (const id of ids) {
  const p = JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8'))
  // the runner's stations (do-ahead preparations and notes are not on the bench)
  const steps = partitionSteps(p.steps).stations
  const L = buildLedger(steps, { containers: sampleContainerSequence(steps), colorOf: (n) => parseInt(reagentColor(n).slice(1), 16) })
  say(`\n## ${id}\n`)
  L.stations.forEach((st, si) => {
    const ids2 = [...new Set([...Object.keys(st.start), ...Object.keys(st.end)])]
    const changed = ids2.filter((k) => Math.abs((st.start[k]?.ul ?? 0) - (st.end[k]?.ul ?? 0)) > 1e-9 || !st.start[k] !== !st.end[k])
    const v = (side, k) => side[k] ? `${fmt(side[k].ul)} ${hex(side[k].color)}` : '—'
    say(`- **station ${si + 1} (step ${st.index}) ${st.action}** · ${st.vessel}: ${v(st.start, st.vessel)} → ${v(st.end, st.vessel)}` +
      (changed.filter((k) => k !== st.vessel).length ? ` · ${changed.filter((k) => k !== st.vessel).map((k) => `${k} ${v(st.start, k)} → ${v(st.end, k)}`).join(' · ')}` : ''))
    for (const o of st.ops) say(`  - ${o.op} ${fmt(o.ul)}${o.from ? ' from ' + o.from : ''}${o.to ? ' → ' + o.to : ''}${o.method ? ` (${o.method}${o.passes ? ', ' + o.passes + ' pass' + (o.passes > 1 ? 'es' : '') : ''}${o.serological ? ', drawn as one pass' : ''})` : ''}${o.why ? ' — ' + o.why : ''}`)
    for (const n of st.notes) say(`  - rule: ${n}`)
    for (const f of st.flags) say(`  - ⚑ ${f}`)
  })
}
if (arg('md')) fs.writeFileSync(arg('md'), out.join('\n') + '\n')
