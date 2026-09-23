// schema-audit.mjs — pure-node semantic audit of every bundled protocol.
//
// No browser, no GPU, no API key. This answers the question the renders cannot:
// across all 9 protocols, which steps would render a LIE, and which fall through
// to `generic` because the verb or container vocabulary does not cover them.
//
// Every `generic` fallback is a step that renders bland — the sample sits on a
// bench while the text says something happened. That is the generalisation
// problem in one number.
//
//   node scripts/schema-audit.mjs            # all bundled protocols
//   node scripts/schema-audit.mjs pcr western
//   node scripts/schema-audit.mjs --json     # machine-readable, for an agent loop
import fs from 'fs'
import path from 'path'
import {
  resolveRecipe, resolveContainer, resolveRemoval,
  sampleContainerSequence, findTargetDefects,
  findTransferHandoffDefects, findPrepareOnSampleDefects,
  findInstrumentDefects, findUnmodelledInstruments,
} from '../src/vessel/sceneRecipe.js'

const DIR = path.join(process.cwd(), 'public', 'protocols')
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const only = argv.filter((a) => !a.startsWith('--'))

// A resolver fell back iff it returns the same object as an impossible key.
const GENERIC_RECIPE = resolveRecipe('__no_such_action__')
const GENERIC_CONTAINER = resolveContainer('__no_such_container__')
const isUnknownAction = (a) => resolveRecipe(a) === GENERIC_RECIPE && a !== 'generic'
const isUnknownContainer = (c) => resolveContainer(c) === GENERIC_CONTAINER && c !== 'generic'

const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'))
const wanted = only.length ? index.filter((p) => only.includes(p.id)) : index

const report = []
const actionTally = new Map()
const containerTally = new Map()
const bump = (map, key, unknown) => {
  const e = map.get(key) || { key, count: 0, unknown }
  e.count++
  map.set(key, e)
}

for (const meta of wanted) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, meta.file), 'utf8'))
  const steps = data.steps || []
  const seq = sampleContainerSequence(steps)

  const unknownActions = []
  const unknownContainers = []
  const tipDefects = []

  steps.forEach((s, i) => {
    const action = s.action || 'generic'
    bump(actionTally, action, isUnknownAction(action))
    if (isUnknownAction(action)) unknownActions.push({ index: s.index ?? i, action, text: (s.text_en || s.text || '').slice(0, 90) })

    const container = seq[i]
    bump(containerTally, container, isUnknownContainer(container))
    if (s.container && isUnknownContainer(s.container)) {
      unknownContainers.push({ index: s.index ?? i, container: s.container, text: (s.text_en || s.text || '').slice(0, 90) })
    }

    // Honesty rule: only tubes tip. A plate/dish/membrane/slide must aspirate.
    // Flag any discard/transfer out of an aspirate-only vessel so the motion can
    // be checked against the rule rather than assumed.
    if ((action === 'discard' || action === 'transfer') && resolveRemoval(container) === 'aspirate') {
      tipDefects.push({ index: s.index ?? i, action, container })
    }
  })

  const entry = {
    id: meta.id,
    name: meta.name,
    steps: steps.length,
    unknownActions,
    unknownContainers,
    targetDefects: findTargetDefects(steps),
    transferHandoffDefects: findTransferHandoffDefects(steps),
    prepareOnSampleDefects: findPrepareOnSampleDefects(steps),
    // Hard constraints 1 + 7: an instrument only when the step's stated conditions
    // require it and it takes the sample's vessel — never from the action alone.
    instrumentDefects: findInstrumentDefects(steps),
    unmodelledInstruments: findUnmodelledInstruments(steps),
    aspirateOnlyRemovals: tipDefects,
  }
  entry.defectCount = entry.unknownActions.length + entry.unknownContainers.length +
    entry.targetDefects.length + entry.transferHandoffDefects.length + entry.prepareOnSampleDefects.length +
    entry.instrumentDefects.length
  report.push(entry)
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    report,
    actions: [...actionTally.values()].sort((a, b) => b.count - a.count),
    containers: [...containerTally.values()].sort((a, b) => b.count - a.count),
  }, null, 2))
  process.exit(0)
}

const totalSteps = report.reduce((n, r) => n + r.steps, 0)
const totalDefects = report.reduce((n, r) => n + r.defectCount, 0)
const genericSteps = [...actionTally.values()].filter((a) => a.unknown || a.key === 'generic').reduce((n, a) => n + a.count, 0)

console.log(`\nbenchpilot scene audit — ${report.length} protocols, ${totalSteps} steps\n`)

for (const r of report) {
  const mark = r.defectCount === 0 ? '✓' : '✗'
  console.log(`${mark} ${r.name}  (${r.id}, ${r.steps} steps)  defects: ${r.defectCount}`)
  const show = (label, rows, fmt) => {
    if (!rows.length) return
    console.log(`    ${label} (${rows.length})`)
    for (const d of rows.slice(0, 8)) console.log(`      step ${d.index}: ${fmt(d)}`)
    if (rows.length > 8) console.log(`      … ${rows.length - 8} more`)
  }
  show('unknown action → renders as bench', r.unknownActions, (d) => `${d.action} — "${d.text}"`)
  show('unknown container → renders as a tube', r.unknownContainers, (d) => `${d.container} — "${d.text}"`)
  show('target contradicts action', r.targetDefects, (d) => `${d.why} (target=${d.target})`)
  show('transfer names no destination', r.transferHandoffDefects, (d) => `carries ${d.container} forward — hand-off never fires`)
  show('prepare targets the sample vessel', r.prepareOnSampleDefects, (d) => `mix would be made in the sample's ${d.container}`)
  show('guessed instrument', r.instrumentDefects, (d) => `${d.action} → ${d.instrument} on ${d.container}: ${d.why}`)
  show('names an unmodelled instrument → renders as bench', r.unmodelledInstruments, (d) => `${d.action} — ${d.names.join(', ')}`)
  show('removal from an aspirate-only vessel', r.aspirateOnlyRemovals, (d) => `${d.action} from ${d.container} — must aspirate, never tip`)
}

console.log(`\nvocabulary coverage`)
console.log(`  actions seen: ${actionTally.size}   containers seen: ${containerTally.size}`)
const unknownA = [...actionTally.values()].filter((a) => a.unknown)
const unknownC = [...containerTally.values()].filter((c) => c.unknown)
if (unknownA.length) console.log(`  actions NOT in the recipe map: ${unknownA.map((a) => `${a.key}×${a.count}`).join(', ')}`)
if (unknownC.length) console.log(`  containers NOT in the container map: ${unknownC.map((c) => `${c.key}×${c.count}`).join(', ')}`)
console.log(`  steps that render generic/bench: ${genericSteps}/${totalSteps} (${Math.round((genericSteps / totalSteps) * 100)}%)`)
console.log(`\ntotal defects: ${totalDefects}\n`)

process.exitCode = totalDefects === 0 ? 0 : 1
