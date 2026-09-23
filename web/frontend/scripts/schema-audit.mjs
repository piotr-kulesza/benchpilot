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
//   node scripts/schema-audit.mjs --file parsed.json [--json]
//        audit ONE parsed protocol (any path) — the parse pipeline's gate: exit 1 when it
//        breaks a parse invariant, so a bad parse is re-parsed instead of bundled
import fs from 'fs'
import path from 'path'
import {
  resolveRecipe, resolveContainer, resolveRemoval,
  sampleContainerSequence, findTargetDefects,
  findTransferHandoffDefects, findPrepareOnSampleDefects,
  findInstrumentDefects, findUnmodelledInstruments, findParseInvariantDefects,
} from '../src/vessel/sceneRecipe.js'

const DIR = path.join(process.cwd(), 'public', 'protocols')
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const fileIdx = argv.indexOf('--file')
const FILE = fileIdx >= 0 ? argv[fileIdx + 1] : null
const only = argv.filter((a, i) => !a.startsWith('--') && !(fileIdx >= 0 && i === fileIdx + 1))

// A resolver fell back iff it returns the same object as an impossible key.
const GENERIC_RECIPE = resolveRecipe('__no_such_action__')
const GENERIC_CONTAINER = resolveContainer('__no_such_container__')
const isUnknownAction = (a) => resolveRecipe(a) === GENERIC_RECIPE && a !== 'generic'
const isUnknownContainer = (c) => resolveContainer(c) === GENERIC_CONTAINER && c !== 'generic'

// Accepted exceptions (bundle mode only): dated, with a clearing condition. A matching
// defect leaves the headline count; an exception matching nothing is a defect itself.
const EXC_FILE = path.join(process.cwd(), 'scripts', 'audit-exceptions.json')
const EXCEPTIONS = !FILE && fs.existsSync(EXC_FILE) ? JSON.parse(fs.readFileSync(EXC_FILE, 'utf8')).exceptions : []
const excUsed = new Set()
const isAccepted = (pid, d) => {
  const k = EXCEPTIONS.findIndex((e) => e.protocol === pid && e.step === d.index && e.rule === (d.rule || d.why))
  if (k >= 0) excUsed.add(k)
  return k >= 0
}

const index = FILE
  ? [{ id: path.basename(FILE, '.json'), name: path.basename(FILE), file: path.resolve(FILE) }]
  : JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'))
const wanted = only.length && !FILE ? index.filter((p) => only.includes(p.id)) : index

const report = []
const actionTally = new Map()
const containerTally = new Map()
const bump = (map, key, unknown) => {
  const e = map.get(key) || { key, count: 0, unknown }
  e.count++
  map.set(key, e)
}

for (const meta of wanted) {
  const data = JSON.parse(fs.readFileSync(path.resolve(DIR, meta.file), 'utf8'))
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
    // the parse prompt's vessel MUSTs (elute -> eluate_tube, only elute enters it, the
    // first step names its vessel, seed names its destination)
    parseInvariantDefects: findParseInvariantDefects(steps),
    // Hard constraints 1 + 7: an instrument only when the step's stated conditions
    // require it and it takes the sample's vessel — never from the action alone.
    instrumentDefects: findInstrumentDefects(steps),
    unmodelledInstruments: findUnmodelledInstruments(steps),
    aspirateOnlyRemovals: tipDefects,
  }
  // move accepted exceptions out of the defect lists (bundle mode only)
  entry.acceptedExceptions = []
  for (const field of ['parseInvariantDefects', 'targetDefects', 'transferHandoffDefects', 'prepareOnSampleDefects', 'instrumentDefects']) {
    entry[field] = entry[field].filter((d) => {
      if (!isAccepted(meta.id, d)) return true
      entry.acceptedExceptions.push({ ...d, field })
      return false
    })
  }
  entry.defectCount = entry.unknownActions.length + entry.unknownContainers.length +
    entry.targetDefects.length + entry.transferHandoffDefects.length + entry.prepareOnSampleDefects.length +
    entry.instrumentDefects.length + entry.parseInvariantDefects.length
  report.push(entry)
}

// an exception that matched no defect is stale — report it as a defect so it is deleted
const staleExceptions = EXCEPTIONS.filter((_, k) => !excUsed.has(k) && (!only.length || only.includes(EXCEPTIONS[k].protocol)))

if (JSON_OUT) {
  console.log(JSON.stringify({
    report,
    staleExceptions,
    actions: [...actionTally.values()].sort((a, b) => b.count - a.count),
    containers: [...containerTally.values()].sort((a, b) => b.count - a.count),
  }, null, 2))
  process.exit(report.some((r) => r.defectCount) || staleExceptions.length ? 1 : 0)
}

const totalSteps = report.reduce((n, r) => n + r.steps, 0)
const totalDefects = report.reduce((n, r) => n + r.defectCount, 0) + staleExceptions.length
const totalAccepted = report.reduce((n, r) => n + r.acceptedExceptions.length, 0)
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
  show('parse invariant broken', r.parseInvariantDefects, (d) => `${d.rule} (${d.action}, container=${d.container})`)
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
if (totalAccepted || staleExceptions.length) {
  console.log(`\naccepted exceptions (scripts/audit-exceptions.json) — NOT counted as defects`)
  for (const r of report) for (const d of r.acceptedExceptions) {
    const e = EXCEPTIONS.find((x) => x.protocol === r.id && x.step === d.index && x.rule === (d.rule || d.why))
    console.log(`  ${r.id} step ${d.index}: ${d.rule || d.why}  (since ${e.added}; clears when ${e.clears_when})`)
  }
  for (const e of staleExceptions) console.log(`  ✗ STALE: ${e.protocol} step ${e.step} ${e.rule} no longer occurs — delete this exception (counted as a defect)`)
}
console.log(`\ntotal defects: ${totalDefects}${totalAccepted ? `   (accepted exceptions: ${totalAccepted})` : ''}\n`)

process.exitCode = totalDefects === 0 ? 0 : 1
