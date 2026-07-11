// Pure, framework-free runtime logic for the protocol player.
//
// Everything here is deterministic and side-effect-free so it can be unit-tested
// offline with no DOM, no network, and no real timers. The React layer imports
// these helpers and only owns rendering + wall-clock ticking.

export const PHASE_ORDER = ['preparation', 'procedure', 'quality_control', 'notes']

// The fixed animation vocabulary — mirrors core/schema.py ACTIONS. The frontend
// must ship exactly one looping visual per value; unknown actions fall back to
// 'generic'.
export const ACTIONS = [
  'pour_add',
  'pipette_mix',
  'vortex_mix',
  'centrifuge',
  'incubate_wait',
  'heat',
  'cool_ice',
  'transfer',
  'wash',
  'discard',
  'elute',
  'measure',
  'generic',
]

export const PHASE_LABEL = {
  preparation: 'Preparation',
  procedure: 'Procedure',
  quality_control: 'Quality control',
  notes: 'Notes',
}

// ---------------------------------------------------------------------------
// actionable vs. prose steps
// ---------------------------------------------------------------------------
//
// Only steps with a real bench action earn a 3D station: an action that has its
// own device/animation, or a step that carries something to act on (reagents, a
// spin, or a duration). `notes` and prose-only steps (e.g. "prepare buffer per
// kit instructions", "record the yield") are shown as text, not animated. This
// is a PRESENTATION filter — no step is ever dropped from the data.

// `generic` is the only action with no device and no inherent motion.
const PROSE_ACTIONS = new Set(['generic'])

export function isActionableStep(step) {
  if (!step) return false
  if (step.phase === 'notes') return false
  const action = step.action || 'generic'
  if (!PROSE_ACTIONS.has(action)) return true
  // a generic step earns a station only if it carries something to do
  const hasReagents = Array.isArray(step.reagents) && step.reagents.length > 0
  return hasReagents || !!step.spin || !!step.duration_seconds
}

// Split a step list into { stations, notes } — the 3D walkthrough vs the text.
export function partitionSteps(steps = []) {
  const stations = []
  const notes = []
  for (const s of steps) (isActionableStep(s) ? stations : notes).push(s)
  return { stations, notes }
}

// ---------------------------------------------------------------------------
// language selection
// ---------------------------------------------------------------------------
//
// The schema carries the original language verbatim (`text`, `name`, `hazards`,
// `title`, `summary`) PLUS an English translation in parallel `_en` fields. The
// UI defaults to English and can flip to the original. If a translation is
// missing we always fall back to the original — nothing ever renders blank.

export const LANGS = { en: 'English', orig: 'Original' }

// Pick a localized string from an object given a base field name. When lang is
// 'en' and `${base}_en` is a non-empty string, use it; otherwise the base value.
export function localize(obj, base, lang = 'en') {
  if (!obj) return ''
  const orig = obj[base]
  if (lang === 'en') {
    const en = obj[`${base}_en`]
    if (typeof en === 'string' && en.trim()) return en
  }
  return orig || ''
}

// Localized instruction text for a step.
export function stepText(step, lang = 'en') {
  return localize(step, 'text', lang)
}

// Localized reagent display name.
export function reagentName(reagent, lang = 'en') {
  return localize(reagent, 'name', lang)
}

// Localized reagent volume / condition (e.g. "10 µl na 1 ml RLT" -> the English
// rendering in EN mode). Falls back to the original when no translation exists.
export function reagentVolume(reagent, lang = 'en') {
  return localize(reagent, 'volume', lang)
}

export function reagentCondition(reagent, lang = 'en') {
  return localize(reagent, 'condition', lang)
}

// Localized hazards for a step, aligned by index with the original `hazards`.
// Falls back per-item to the original when the English list is short/missing.
export function stepHazards(step, lang = 'en') {
  const orig = step.hazards || []
  if (lang !== 'en') return orig
  const en = step.hazards_en || []
  return orig.map((h, i) => (en[i] && en[i].trim() ? en[i] : h))
}

// ---------------------------------------------------------------------------
// duration formatting
// ---------------------------------------------------------------------------

// Seconds -> "m:ss" (or "h:mm:ss" for long windows like the 24 h freshness one).
// Used both for timer countdowns and for static badges.
export function formatDuration(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds) || totalSeconds < 0) return ''
  const s = Math.round(totalSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${minutes}:${pad(seconds)}`
}

// A short human label for badges: "15 s", "2 min", "24 h".
export function humanDuration(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds) || totalSeconds < 0) return ''
  const s = Math.round(totalSeconds)
  if (s >= 3600) return `${trimNum(s / 3600)} h`
  if (s >= 60) return `${trimNum(s / 60)} min`
  return `${s} s`
}

function trimNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

// ---------------------------------------------------------------------------
// conditional resolution from intake answers
// ---------------------------------------------------------------------------
//
// The parse surfaces branches as free-text conditions in the protocol's original
// language (e.g. "≤ 5×10⁶ komórek", "zestaw RNeasy Micro"). We resolve them from
// the structured intake answers by keyword matching — robust across Polish/English
// and independent of exact phrasing.
//
// answers shape: { kit: 'mini'|'micro'|null, cells: 'le'|'gt'|null, ... }

// Returns true (matches the answer), false (contradicts it), or null (can't tell
// / not answered yet).
export function conditionMatchesAnswers(condition, answers = {}) {
  const c = (condition || '').toLowerCase()

  // Kit variant (Micro must be tested before Mini — "mini" is a substring guard).
  if (c.includes('micro')) return answers.kit ? answers.kit === 'micro' : null
  if (c.includes('mini')) return answers.kit ? answers.kit === 'mini' : null

  // Cell-count branch.
  const saysLow = c.includes('≤') || c.includes('<=') || c.includes('≦')
  const saysHigh = c.includes('>') || c.includes('większ') || c.includes('greater') || c.includes('more')
  if (saysLow && !saysHigh) return answers.cells ? answers.cells === 'le' : null
  if (saysHigh && !saysLow) return answers.cells ? answers.cells === 'gt' : null

  return null
}

// Given a step and intake answers, classify its conditionals into
// { selected, rejected, undecided } lists. `selected` is what the runner shows.
export function resolveConditionals(step, answers = {}) {
  const selected = []
  const rejected = []
  const undecided = []
  for (const cond of step.conditionals || []) {
    const match = conditionMatchesAnswers(cond.condition, answers)
    if (match === true) selected.push(cond)
    else if (match === false) rejected.push(cond)
    else undecided.push(cond)
  }
  return { selected, rejected, undecided }
}

// Resolve which reagent rows apply given the answers. A reagent whose `condition`
// contradicts the answers is dropped; one that matches (or has no condition, or is
// undecided) is kept, flagged so the UI can highlight a resolved choice.
export function resolveReagents(step, answers = {}) {
  return (step.reagents || [])
    .map((r) => {
      if (!r.condition) return { ...r, state: 'always' }
      const match = conditionMatchesAnswers(r.condition, answers)
      if (match === true) return { ...r, state: 'selected' }
      if (match === false) return { ...r, state: 'rejected' }
      return { ...r, state: 'undecided' }
    })
    .filter((r) => r.state !== 'rejected')
}

// ---------------------------------------------------------------------------
// alternatives (either/or)
// ---------------------------------------------------------------------------

export function hasAlternatives(step) {
  return Array.isArray(step.alternatives) && step.alternatives.length > 0
}

// Pick the chosen alternative branch (defaults to the first) and return the step
// object the runner should actually display for this step.
export function selectAlternative(step, chosenIndex = 0) {
  if (!hasAlternatives(step)) return step
  const idx = Math.max(0, Math.min(chosenIndex, step.alternatives.length - 1))
  return step.alternatives[idx]
}

// ---------------------------------------------------------------------------
// repeats
// ---------------------------------------------------------------------------

// The declared number of passes (falls back to 1 when only a reason is given).
export function repeatTarget(step) {
  const r = effectiveStep(step).repeat
  if (!r) return 1
  if (typeof r.count === 'number' && r.count > 0) return r.count
  return 1 // count unknown (e.g. "for the remaining volume") — open-ended
}

export function isOpenEndedRepeat(step) {
  const r = effectiveStep(step).repeat
  return !!(r && (r.count == null) && r.reason)
}

// Advance the pass counter, clamped to the target (unless open-ended).
export function nextPass(current, target, openEnded = false) {
  const next = current + 1
  if (openEnded) return Math.max(1, next)
  return Math.min(next, Math.max(1, target))
}

// ---------------------------------------------------------------------------
// hazards
// ---------------------------------------------------------------------------

const NEGATIVE_MARKERS = [
  'nie ', 'nie ', 'not ', 'do not', "don't", 'never', 'unikać', 'avoid',
  'zakaz', 'bez ',
]

// A hazard is "critical" (rendered boldly in red) when it is a negative/forbidding
// instruction — the ones you must not miss ("Nie wirować" / "do NOT centrifuge").
export function isCriticalHazard(text) {
  const t = (text || '').toLowerCase()
  return NEGATIVE_MARKERS.some((m) => t.includes(m))
}

// ---------------------------------------------------------------------------
// timer eligibility
// ---------------------------------------------------------------------------

// The effective step is the chosen alternative branch if any, else the step.
export function effectiveStep(step, chosenIndex = 0) {
  return hasAlternatives(step) ? selectAlternative(step, chosenIndex) : step
}

// Seconds to count down for a step, if it is a timed (wait/spin) step. Prefers an
// explicit spin duration, then the step duration. Returns null if not timed.
export function timerSeconds(step, chosenIndex = 0) {
  const s = effectiveStep(step, chosenIndex)
  if (s.spin && s.spin.duration_seconds) return s.spin.duration_seconds
  if ((s.kind === 'wait' || s.kind === 'spin') && s.duration_seconds) return s.duration_seconds
  return null
}

// ---------------------------------------------------------------------------
// temperature extraction (for incubate_wait / heat animations)
// ---------------------------------------------------------------------------

// Best-effort temperature label pulled from a step's text (either language).
// "inkubować 15 min w temperaturze pokojowej" -> "RT"; "42 °C" -> "42 °C";
// "−80°C" -> "−80 °C". Returns null when no temperature is stated.
export function extractTemperature(step, lang = 'en') {
  const hay = `${step.text || ''} ${step.text_en || ''}`
  const m = hay.match(/(-|−|–)?\s*\d{1,3}\s*°?\s*C\b/)
  if (m) {
    return m[0]
      .replace(/\s+/g, ' ')
      .replace(/([−–])\s*/, '−')
      .replace(/\s*°?\s*C/, ' °C')
      .trim()
  }
  const t = hay.toLowerCase()
  if (t.includes('pokojow') || t.includes('room temp')) return 'RT'
  return null
}

// ---------------------------------------------------------------------------
// intake field derivation
// ---------------------------------------------------------------------------
//
// Turn open_parameters (+ step gaps) into a compact set of form fields. Two of
// them (kit, cell count) are structured because they drive conditionals; the rest
// render as free-text so the user records their decision. Deduped by key.

export function deriveIntakeFields(protocol) {
  const fields = []
  const seen = new Set()
  const add = (f) => {
    if (seen.has(f.key)) return
    seen.add(f.key)
    fields.push(f)
  }

  const questions = [
    ...(protocol.open_parameters || []).map((p) => ({ text: p.question, where: p.where })),
    ...collectGapQuestions(protocol),
  ]

  for (const q of questions) {
    const t = (q.text || '').toLowerCase()
    // Known fields get a clean English question so the default UI reads well; the
    // original phrasing is kept in `questionOrig` for the language toggle.
    if ((t.includes('mini') && t.includes('micro')) || t.includes('zestaw') || t.includes('kit')) {
      add({
        key: 'kit',
        question: 'Which kit — RNeasy Mini or Micro?',
        questionOrig: q.text,
        where: q.where,
        type: 'choice',
        answerKey: 'kit',
        options: [
          { value: 'mini', label: 'RNeasy Mini' },
          { value: 'micro', label: 'RNeasy Micro' },
        ],
      })
    } else if (t.includes('komórek') || t.includes('komorek') || t.includes('cells') || t.includes('cell count') || t.includes('5×10')) {
      add({
        key: 'cells',
        question: 'How many input cells?',
        questionOrig: q.text,
        where: q.where,
        type: 'choice',
        answerKey: 'cells',
        options: [
          { value: 'le', label: '≤ 5×10⁶ cells' },
          { value: 'gt', label: '> 5×10⁶ cells' },
        ],
      })
    } else if (t.includes('bulk') || t.includes('single-cell') || t.includes('single cell')) {
      add({
        key: 'analysis',
        question: 'Bulk or single-cell analysis?',
        questionOrig: q.text,
        where: q.where,
        type: 'choice',
        answerKey: 'analysis',
        options: [
          { value: 'bulk', label: 'Bulk' },
          { value: 'single', label: 'Single-cell' },
        ],
      })
    } else if (t.includes('rin')) {
      add({
        key: 'rin',
        question: 'Target RIN acceptance threshold?',
        questionOrig: q.text,
        where: q.where,
        type: 'text',
        answerKey: 'rin',
        placeholder: 'e.g. ≥ 7',
      })
    } else {
      const key = 'q_' + slug(q.text)
      add({ key, question: q.text, questionOrig: q.text, where: q.where, type: 'text', answerKey: key })
    }
  }
  return fields
}

function collectGapQuestions(protocol) {
  const out = []
  for (const step of protocol.steps || []) {
    for (const g of step.gaps || []) out.push({ text: g.question, where: `step ${step.index}` })
  }
  return out
}

function slug(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}
