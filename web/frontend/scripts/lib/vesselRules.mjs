// vesselRules.mjs — the audit's interpreter for core/vessel_rules.json.
//
// The parse-time vessel rules are DATA, read by two interpreters: this one (schema-audit)
// and core/validate.py (the parse gate + the live API). Both are held to
// tests/fixtures/vessel_rule_cases.json — keep the semantics here identical to
// find_vessel_rule_defects in core/validate.py.
import fs from 'fs'
import { fileURLToPath } from 'url'
import { CONTAINER_TOKENS } from '../../src/vessel/sceneRecipe.js'

export const RULES_FILE = fileURLToPath(new URL('../../../../core/vessel_rules.json', import.meta.url))

export function loadVesselRules(file = RULES_FILE) {
  const rules = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(rules?.rules) || !rules.rules.length) throw new Error(`${file}: no rules`)
  return rules
}

const asList = (v) => (Array.isArray(v) ? v : [v])

// Every (step, rule) the parse breaks, in step order: [{ index, rule, action, container }].
export function findVesselRuleDefects(steps = [], rules = loadVesselRules()) {
  const known = new Set(CONTAINER_TOKENS)
  const out = []
  let current = null
  let first = true
  steps.forEach((s, i) => {
    if (!s || typeof s !== 'object' || s.action === 'prepare') return
    const idx = s.index != null ? s.index : i
    const named = known.has(s.container) ? s.container : null
    const isFirst = first
    first = false
    for (const r of rules.rules) {
      const w = r.when || {}
      const req = r.require || {}
      if ('action' in w && !asList(w.action).includes(s.action)) continue
      if (w.first_sample_step && !isFirst) continue
      if ('enters' in w && !(named === w.enters && current !== w.enters)) continue
      let ok = true
      if ('container' in req) ok = req.container === 'named' ? named != null : named === req.container
      if (ok && 'action' in req) ok = asList(req.action).includes(s.action)
      if (!ok) out.push({ index: idx, rule: r.id, action: s.action ?? null, container: s.container ?? null })
    }
    if (named) current = named
  })
  return out
}

// id -> evidence label, for honest reporting ("real" vs "hand-edited-only")
export function ruleEvidence(rules = loadVesselRules()) {
  return Object.fromEntries(rules.rules.map((r) => [r.id, r.evidence]))
}
