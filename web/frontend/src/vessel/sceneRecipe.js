// ─────────────────────────────────────────────────────────────────────────
// sceneRecipe.js — pure resolvers for the equipment-aware Scene.
//
// TWO DECOUPLED AXES (this is the Stage-6 generalization):
//   • ACTION → EQUIPMENT + anim.  What the step DOES (a centrifuge spins, a plate
//     reader reads). `resolveRecipe(action)` answers this. `anim` IS the behavior.js
//     descriptor so the two modules never drift.
//   • CONTAINER → geometry + removal motion.  WHERE the sample sits (microtube,
//     well plate, membrane, …). This now comes from the sample-follow sequence
//     (`sampleContainerSequence`, seeded + persisted from each step's parsed
//     `container`), NOT from a per-action `vessel`/`handoff`. A "transfer" is simply
//     a step whose container differs from the previous one.
//
// Imports nothing heavy (no three.js / DOM / network) so it runs in node under
// Vitest. GUARANTEES every action AND every container resolves — unknown/missing →
// `generic` (action) / persist (container) — so no step ever renders blank.
// ─────────────────────────────────────────────────────────────────────────

import { resolveBehavior } from './behavior.js'
import { INSTRUMENTS } from './containerContract.js'

// action → { equipment }. `anim` is filled in from behavior.js below.
// equipment is the STATION device; the sample's vessel is the container axis.
const RECIPES = {
  pour_add:       { equipment: 'bottle_pipette' },
  prepare:        { equipment: 'bottle_pipette' }, // a SIDE vessel, filled from its reagents' bottles
  pipette_mix:    { equipment: 'bottle_pipette' },
  vortex_mix:     { equipment: 'bench' },
  homogenize:     { equipment: 'syringe' },
  centrifuge:     { equipment: 'centrifuge' },
  incubate_wait:  { equipment: 'bench' },          // instrument from the step's conditions — see resolveRecipe
  heat:           { equipment: 'bench' },          // idem
  cool_ice:       { equipment: 'ice_bucket' },
  transfer:       { equipment: 'bench' },        // no baked destination — container decides
  discard:        { equipment: 'bench' },
  elute:          { equipment: 'centrifuge' },    // the elution spin
  measure:        { equipment: 'bench' },          // idem
  thermocycle:    { equipment: 'thermocycler' },
  electrophorese: { equipment: 'gel_rig' },
  store:          { equipment: 'bench' },          // idem
  seed:           { equipment: 'bench' },          // container = flask/dish/agar_plate
  stain:          { equipment: 'staining_tray' },
  generic:        { equipment: 'bench' },
}

// The full recipe map, each entry carrying its behavior descriptor as `anim`.
export const SCENE_RECIPES = Object.fromEntries(
  Object.entries(RECIPES).map(([action, r]) => [
    action,
    { ...r, anim: resolveBehavior(action) },
  ]),
)

// ─── what a step STATES — the conditions an instrument choice may rest on ──
// Structured `step.conditions` (temperature_c, room_temperature, on_ice, agitation,
// instruments) are the source of truth PER FIELD when present (not undefined/null — a
// stated false or [] counts). Any field the schema does not carry falls back to the
// parsed step's text (original + English), read the way the runner's Temp chip
// (runtime.extractTemperature) reads it. Pure; unknown → empty.
//   tempC      first stated temperature in °C (signed), or null
//   roomTemp   "room temperature" / RT
//   onIce      "on ice"
//   agitation  shaking / rocking / agitation
//   names      the instruments the text NAMES (modelled or not)
const NAMED = [
  ['shaking_incubator', /shaking incubator|incubator shaker|shaker incubator/i],
  ['co2_incubator',     /\bCO\s?2\b|CO₂/i],
  ['water_bath',        /water[- ]?bath|łaźni/i],
  ['heat_block',        /heat(?:ing)? block|dry block|thermo-?block|thermomixer|blok grzej|termoblok/i],
  ['freezer',           /freezer|zamrażar/i],
  ['liquid_nitrogen',   /liquid nitrogen|\bLN2\b|dewar|ciekł\w* azot/i],
  ['plate_shaker',      /plate shaker|rocker|rocking platform/i],
  ['microwave',         /microwave|mikrofal/i],
  ['flame',             /flame|burner|płomie/i],
  ['thermocycler',      /thermocycler|thermal cycler|termocykler/i],
  ['nanodrop',          /nanodrop|spectrophotomet|A2[368]0/i],
  ['bioanalyzer',       /bioanaly|tapestation/i],
  ['plate_reader',      /plate reader|absorbance|\bOD\s?\d{3}\b|\b\d{3}\s?nm\b/i],
  // NOT "viability" / "detach": assessing viability or detachment names no instrument
  // (trypan + haemocytometer, a counter, or a microscope — the protocol does not say)
  ['microscope',        /microscop|confluen|morpholog/i],
  ['hemocytometer',     /h(?:a)?emocytomet|counting chamber|neubauer|bürker/i],
  ['transilluminator',  /transillumin|gel ?doc/i],
]

function conditionsFromText(step) {
  const hay = `${step?.text || ''} ${step?.text_en || ''}`
  // a minus counts only when it is not a range dash ("55-60°C" is 55, not −60)
  const m = hay.match(/(^|[^\d\s])\s*([-−–]\s*)?(\d{1,3}(?:\.\d+)?)\s*°?\s*C(?![a-zA-Z])/)
  const tempC = m ? (m[2] ? -1 : 1) * Number(m[3]) : null
  return {
    tempC,
    roomTemp: /room temp|\bRT\b|pokojow/i.test(hay),
    onIce: /\bon ice\b|na lodzie|w lodzie/i.test(hay),
    agitation: /agitat|shak|rocking|wytrząs|kołys|orbital/i.test(hay),
    names: NAMED.filter(([, re]) => re.test(hay)).map(([id]) => id),
  }
}

// The instrument ids the text regex can recognise — the same vocabulary the parser
// fills `conditions.instruments` from (core/schema.py INSTRUMENTS; lockstep-tested).
export const NAMED_INSTRUMENTS = NAMED.map(([id]) => id)

export function stepConditions(step) {
  const text = conditionsFromText(step)
  const sc = step?.conditions && typeof step.conditions === 'object' ? step.conditions : {}
  const has = (k) => sc[k] !== undefined && sc[k] !== null
  return {
    tempC: has('temperature_c') ? Number(sc.temperature_c) : text.tempC,
    roomTemp: has('room_temperature') ? !!sc.room_temperature : text.roomTemp,
    onIce: has('on_ice') ? !!sc.on_ice : text.onIce,
    agitation: has('agitation') ? !!sc.agitation : text.agitation,
    names: Array.isArray(sc.instruments) ? sc.instruments.map(String) : text.names,
  }
}

// What each instrument REQUIRES the step to state before it may appear. An instrument
// whose requirement does not hold is a guess — and a guessed instrument is worse than
// none (docs/scene-review.md, hard constraints 1 and 7). Exported so the offline audit
// checks the resolver's output against the same rules.
const named = (c, id) => (c.names || []).includes(id)
const bodyTemp = (c) => c.tempC != null && c.tempC >= 30 && c.tempC <= 40
export const INSTRUMENT_REQUIRES = {
  water_bath:          (c) => named(c, 'water_bath'),
  freezer:             (c) => named(c, 'freezer') || (c.tempC != null && c.tempC <= -15 && c.tempC > -100),
  co2_incubator:       (c) => named(c, 'co2_incubator') || (bodyTemp(c) && !c.roomTemp),
  plate_shaker:        (c) => !!c.agitation,
  ice_bucket:          (c) => !!c.onIce,
  incubation_block:    (c) => named(c, 'heat_block'),
  nanodrop:            (c) => named(c, 'nanodrop'),
  plate_reader:        (c) => named(c, 'plate_reader'),
  inverted_microscope: (c) => named(c, 'microscope'),
  light_microscope:    (c) => named(c, 'microscope') || named(c, 'hemocytometer'),
  uv_transilluminator: (c) => named(c, 'transilluminator'),
  thermocycler:        (c) => named(c, 'thermocycler'),
}

// Named instruments we have NO model for. When a step names one, the honest render is
// the bench — never the nearest-looking device (a dewar is not a −80 freezer, a shaking
// incubator is not a dry block, a Bioanalyzer is not a NanoDrop).
export const UNMODELLED = ['shaking_incubator', 'liquid_nitrogen', 'bioanalyzer', 'microwave', 'flame']
const VETO = {
  store: ['liquid_nitrogen'],
  incubate_wait: ['shaking_incubator'],
}

// action → the instruments it MAY use, in preference order. The first whose requirement
// holds and which accepts the sample's container wins; otherwise the bench.
const CANDIDATES = {
  // a thermocycler PROGRAM step (initial denaturation, final extension, the 4 °C hold)
  // runs in the cycler — when the step names it and the sample is in a PCR tube
  store:         ['thermocycler', 'freezer', 'co2_incubator'],
  heat:          ['thermocycler', 'water_bath'],
  incubate_wait: ['ice_bucket', 'plate_shaker', 'co2_incubator', 'incubation_block'],
  measure:       ['nanodrop', 'plate_reader', 'inverted_microscope', 'light_microscope', 'uv_transilluminator'],
}
const NO_CONDITIONS = { tempC: null, roomTemp: false, onIce: false, agitation: false, names: [] }

// Which instrument (or 'bench') an action uses on this container under these conditions.
export function resolveInstrumentFor(action, container, conditions) {
  const c = { ...NO_CONDITIONS, ...(conditions || {}) }
  if ((VETO[action] || []).some((id) => named(c, id))) return 'bench'
  if (action === 'store' && c.tempC != null && c.tempC <= -100) return 'bench' // cryogenic — no dewar model
  // stated agitation on a vessel the shaker cannot take is not a reason to try the next device
  if (action === 'incubate_wait' && c.agitation && !c.onIce && !INSTRUMENTS.plate_shaker.accepts.includes(container)) return 'bench'
  for (const id of CANDIDATES[action] || []) {
    if (INSTRUMENT_REQUIRES[id](c) && INSTRUMENTS[id].accepts.includes(container)) return id
  }
  return 'bench'
}

// Resolve an action to its scene recipe; unknown / missing → generic. The action alone
// never names an instrument for store / heat / incubate_wait / measure: pass the sample's
// `container` and the step's `conditions` (stepConditions(step)) and the instrument is
// chosen from those — the bench whenever they do not determine one.
// Below this stated RCF a centrifugation is a cell spin (a benchtop swing-bucket
// centrifuge with conical tubes), not a microcentrifuge spin — unmodelled, so the bench.
export const CELL_SPIN_MAX_RCF = 1000

export function resolveRecipe(action, ctx) {
  const base = SCENE_RECIPES[action] || SCENE_RECIPES.generic
  if (action === 'centrifuge' && ctx?.spin?.rcf_min != null && ctx.spin.rcf_min < CELL_SPIN_MAX_RCF) {
    return { ...base, equipment: 'bench' }
  }
  if (!ctx || !CANDIDATES[action]) return base
  const equipment = resolveInstrumentFor(action, ctx.container, ctx.conditions)
  return equipment === base.equipment ? base : { ...base, equipment }
}

// The instrument rule as an AUDIT invariant, over any resolver (default: the real one).
// For every store / heat / incubate_wait / measure step (and each of its either/or
// alternatives), the instrument it resolves to — at the sample's carried container —
// must be one the step's stated conditions REQUIRE and whose container list includes
// that vessel. The bench is always acceptable. `why`:
//   not-required              the step states nothing that calls for this instrument
//   rejects-container         the instrument does not take the sample's vessel
//   contradicts-room-temp     a room-temperature step inside a temperature-controlled device
//   stands-in-for-unmodelled  the step names an instrument we have no model for, and a
//                             modelled device is shown in its place
const TEMPERATURE_CONTROLLED = new Set(['water_bath', 'freezer', 'co2_incubator', 'ice_bucket', 'incubation_block'])
const realResolve = (step, container, conditions) => resolveRecipe(step.action, { container, conditions }).equipment
export function findInstrumentDefects(steps = [], resolve = realResolve) {
  const seq = sampleContainerSequence(steps)
  const out = []
  steps.forEach((s, i) => {
    if (!s || typeof s !== 'object') return
    for (const v of [s, ...(Array.isArray(s.alternatives) ? s.alternatives : [])]) {
      if (!CANDIDATES[v.action]) continue
      const c = stepConditions(v)
      const instrument = resolve(v, seq[i], c)
      if (!instrument || instrument === 'bench') continue
      const row = (why) => out.push({ index: s.index != null ? s.index : i, action: v.action, container: seq[i], instrument, why })
      const req = INSTRUMENT_REQUIRES[instrument]
      if (!req || !req(c)) row('not-required')
      if (!INSTRUMENTS[instrument] || !INSTRUMENTS[instrument].accepts.includes(seq[i])) row('rejects-container')
      if (c.roomTemp && TEMPERATURE_CONTROLLED.has(instrument)) row('contradicts-room-temp')
      if (c.names.some((n) => UNMODELLED.includes(n))) row('stands-in-for-unmodelled')
    }
  })
  return out
}

// A FROZEN STORE IS AN END STATE. A `store` below 0 °C whose own text holds the sample ON
// ICE ("keep the RNA on ice until measurement, store at −80 °C"), with the sample used by a
// later step, cannot be the freezer NOW: the freezer now and the NanoDrop next is the very
// freeze–thaw such a step warns against. The station depicts what happens now — on ice —
// and the storage (after the later steps) has no station. Nothing else is rewritten: a 4 °C
// hold, the last thing done to the sample, or a freeze followed only by more cold storage.
const USES_SAMPLE_AFTER = (s) => s && typeof s === 'object' && actsOnSample(s) && !['store', 'generic', 'prepare'].includes(s.action)
export function sceneStep(steps, i) {
  const s = steps[i]
  if (!s || s.action !== 'store') return s
  const c = stepConditions(s)
  if (!(c.tempC != null && c.tempC < 0) || !conditionsFromText(s).onIce) return s
  if (!steps.slice(i + 1).some(USES_SAMPLE_AFTER)) return s
  return { ...s, action: 'cool_ice', conditions: { ...(s.conditions || {}), on_ice: true, temperature_c: null, instruments: [] } }
}
// The audit: a sub-zero store depicted in an instrument while a later step still uses the
// sample. `sceneOf` is injectable so the pre-fix behaviour (the step as parsed) can be replayed.
export function findStoreBeforeUseDefects(steps = [], sceneOf = sceneStep) {
  const seq = sampleContainerSequence(steps)
  const out = []
  steps.forEach((s0, i) => {
    const s = sceneOf(steps, i)
    if (!s || s.action !== 'store') return
    const c = stepConditions(s)
    if (!(c.tempC != null && c.tempC < 0)) return
    const instrument = resolveRecipe(s.action, { container: seq[i], conditions: c }).equipment
    if (instrument === 'bench') return
    const j = steps.findIndex((t, k) => k > i && USES_SAMPLE_AFTER(t))
    if (j > i) out.push({ index: s0.index != null ? s0.index : i, instrument, usedAt: steps[j].index != null ? steps[j].index : j })
  })
  return out
}

// Steps that NAME an instrument we have no model for — they render on the bench. Not a
// defect (a missing instrument is honest) but a coverage gap worth seeing, like a
// `generic` fallback.
// Instruments an ACTION stages itself: a step with that action is not rendering a
// stand-in, so naming the instrument there is not a coverage gap.
const STAGED_BY_ACTION = { thermocycle: ['thermocycler'] }

export function findUnmodelledInstruments(steps = []) {
  const out = []
  steps.forEach((s, i) => {
    const staged = (s && STAGED_BY_ACTION[s.action]) || []
    const names = s && typeof s === 'object'
      ? stepConditions(s).names.filter((n) => UNMODELLED.includes(n) && !staged.includes(n))
      : []
    if (names.length) out.push({ index: s.index != null ? s.index : i, action: s.action, names })
  })
  return out
}

// ─── container axis ──────────────────────────────────────────────────────
// container → { geo (geometry key the Scene mounts), removal (how liquid leaves) }.
//   removal 'tip'      — the vessel tilts and dumps (a tube you can pick up)
//   removal 'aspirate' — a pipette sucks it out (NEVER tip a plate/dish/membrane)
// The `geo` key maps to a demoScene builder / sample-vessel slot in the Scene.
const CONTAINERS = {
  microtube:   { geo: 'tube',     removal: 'tip' },
  tube:        { geo: 'tube',     removal: 'tip' },
  spin_column: { geo: 'column',   removal: 'tip' },
  eluate_tube: { geo: 'elu',      removal: 'tip' },
  pcr_tube:    { geo: 'pcrtube',  removal: 'tip' },
  cryovial:    { geo: 'cryovial', removal: 'tip' },
  bottle:      { geo: 'tube',     removal: 'tip' },
  well_plate:  { geo: 'wellplate', removal: 'aspirate' },
  flask:       { geo: 'flask',    removal: 'aspirate' },
  dish:        { geo: 'dish',     removal: 'aspirate' },
  membrane:    { geo: 'membrane', removal: 'aspirate' },
  slide:       { geo: 'slide',    removal: 'aspirate' },
  gel:         { geo: 'gel',      removal: 'aspirate' },
  agar_plate:  { geo: 'agarplate', removal: 'aspirate' },
  generic:     { geo: 'tube',     removal: 'tip' },
}

// The closed container vocabulary (lockstep-tested against core/schema.py CONTAINERS).
export const CONTAINER_TOKENS = Object.keys(CONTAINERS)

// Resolve a container token → { geo, removal }; unknown/missing → generic (a tube).
export function resolveContainer(container) {
  return CONTAINERS[container] || CONTAINERS.generic
}

// How liquid is removed from the CURRENT container: 'tip' vs 'aspirate'.
export function resolveRemoval(container) {
  return resolveContainer(container).removal
}

// The ONE travelling sample's container as each step BEGINS — the SAMPLE-FOLLOW
// model. Seed with the first named container (or microtube), then for each step
// use its parsed `container` if present, else CARRY the previous one. Pure so the
// invariant is unit-testable. `steps` is the ordered list of step objects.
const MIX_OR_ADD = new Set(['pour_add', 'pipette_mix', 'vortex_mix'])
export function sampleContainerSequence(steps = []) {
  const out = []
  let container = 'microtube'
  for (const s of steps) {
    const named = s && typeof s === 'object' ? s.container : null
    // a `prepare` step happens in ITS OWN vessel, on the side — the sample never moves,
    // so its container (the mix's tube) must NOT advance the sample-follow.
    if (s?.action !== 'prepare' && named && CONTAINERS[named]) container = named
    // #6: an add or mix that names no vessel cannot happen IN a gel or a membrane — the
    // sample is being made up in its tube ("mix each DNA sample with loading dye")
    else if (!named && MIX_OR_ADD.has(s?.action) && (container === 'gel' || container === 'membrane')) container = 'microtube'
    out.push(container)
  }
  return out
}

// Leaving a docked instrument (rotor slot, heat block, bath, freezer), the ONE sample
// lifts STRAIGHT UP to a clearance height before it glides on — it must never drag
// diagonally through the rotor or the lid. Pure so the exit geometry (same x/z, raised y)
// is unit-testable without a GPU. `from` is the sample's current position; `clearY` is the
// height that clears the instrument.
export function exitLiftPoint(from, clearY) {
  const { x = 0, y = 0, z = 0 } = from || {}
  return { x, y: Math.max(y, clearY), z }
}

// Does this step act on the travelling sample, or on a side prep vessel? A `prepare`
// step acts on its OWN product (target = its `produces` id); everything else acts on
// the sample. A step that DRAWS FROM a mix still targets the sample (the mix is applied
// TO it). This is the single source of truth the renderer uses to pick the acting vessel.
export function actsOnSample(step) {
  if (!step || typeof step !== 'object') return true
  if (step.action === 'prepare') return false
  return !step.target || step.target === 'sample'
}

// Stage 34 invariant: every step must say WHICH vessel it acts on, consistently. A
// `prepare` must NOT target the sample (it acts on its own product); every other step
// MUST target the sample. Surface any step whose `target` contradicts its action so a
// mislabelled vessel can never render the mix pouring into the sample (or vice versa).
export function findTargetDefects(steps = []) {
  const out = []
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (!s || typeof s !== 'object') continue
    const idx = s.index != null ? s.index : i
    if (s.action === 'prepare') {
      if (!s.target || s.target === 'sample') out.push({ index: idx, target: s.target || null, why: 'prepare-targets-sample' })
    } else if (s.target && s.target !== 'sample') {
      out.push({ index: idx, target: s.target, why: 'non-prepare-targets-prep-vessel' })
    }
  }
  return out
}

// A `transfer` is the ONE action that, by definition, moves the sample into a NEW
// vessel — so it MUST name that destination in its own `container`. When it doesn't,
// the container simply CARRIES forward from the previous step: the sample-follow sees
// no change, the hand-off never fires, and the tube quietly fills. That is the DATA
// DEFECT the `transfer → spin_column` hardcode masked for weeks (the "load column"
// regression). Surface every transfer that fails to name its own destination — never
// silently tolerate it. A transfer that explicitly names a vessel (even the same TYPE,
// e.g. aliquoting a tube into fresh tubes) is fine: the destination WAS declared.
export function findTransferHandoffDefects(steps = []) {
  const seq = sampleContainerSequence(steps)
  const out = []
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (!s || typeof s !== 'object' || s.action !== 'transfer') continue
    const named = s.container && CONTAINERS[s.container]
    if (!named) out.push({ index: s.index != null ? s.index : i, container: seq[i] })
  }
  return out
}

// A `prepare` is a SIDE PREPARATION: it combines reagents in ITS OWN fresh vessel and
// the sample is never an ingredient — so it must NEVER name the sample's SPECIALIZED
// current vessel (a spin_column, well_plate, membrane, …) as its destination. If it did,
// the renderer would make the mix IN the sample's vessel — the "DNase into the column"
// lie Stage 33 fixed. A fresh `microtube`/`tube` is exactly what a side prep legitimately
// uses, so a tube-on-tube coincidence is NOT a defect (both are just anonymous fresh tubes).
const FRESH_TUBES = new Set(['microtube', 'tube'])
export function findPrepareOnSampleDefects(steps = []) {
  const seq = sampleContainerSequence(steps)
  const out = []
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (!s || typeof s !== 'object' || s.action !== 'prepare') continue
    if (s.container && s.container === seq[i] && !FRESH_TUBES.has(s.container)) {
      out.push({ index: s.index != null ? s.index : i, container: s.container })
    }
  }
  return out
}

// #13 — POUR or PIPETTE. A pour is the word "pour", or a volume no pipette handles:
// 50 mL and up (a micropipette tops out at 1 mL, a serological pipette at 50 mL). "mL"
// alone is not a pour — ~2 mL into a T-flask is pipetted. The tipped bottle is the first
// bulk reagent's; for a stated pour without one, the step's first reagent's. A pour that
// states no reagent has no bottle — none is invented (reagentIndex -1).
export const POUR_MIN_ML = 50
function volumeMl(v) {
  const m = String(v || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(m[lL]|milliliters?|millilitres?|L|liters?|litres?)\b/)
  if (!m) return null
  return /^m/.test(m[2]) ? Number(m[1]) : Number(m[1]) * 1000
}
export function pourPlan(step) {
  const reagents = (step && step.reagents) || []
  const ml = (x) => volumeMl(x?.volume_en) ?? volumeMl(x?.volume)
  let reagentIndex = reagents.findIndex((x) => (ml(x) ?? 0) >= POUR_MIN_ML)
  // a rinse is a continuous stream from the reagent's (wash) bottle, like a pour
  const saysPour = /\b(pour|rins)/i.test(`${step?.text_en || ''} ${step?.text || ''}`)
  if (reagentIndex < 0 && saysPour && reagents.length) reagentIndex = 0
  return { pour: reagentIndex >= 0 || saysPour, reagentIndex }
}

// #14 — how liquid leaves the vessel at a discard: the container's own rule (a plate,
// dish, membrane, slide, gel is ALWAYS aspirated), unless the step itself says
// "aspirate", which makes even a tube a pipette removal.
export function removalFor(container, text) {
  if (/aspirat/i.test(String(text || ''))) return 'aspirate'
  return resolveRemoval(container)
}

// Bench-fallback staging: a step that renders on the bare bench shows ONLY what it
// states — a bench tag for a stated temperature or "room temperature" (a timed one has no
// bench dial: the countdown lives in the HUD). An unstated condition gets no tag; a station
// with an instrument gets none of this (null).
export function benchStaging(step, equipment) {
  if (equipment !== 'bench') return null
  const c = stepConditions(step || {})
  let tag = null
  if (c.tempC != null) tag = `${c.tempC < 0 ? '−' : ''}${Math.abs(c.tempC)} °C`
  else if (c.roomTemp) tag = 'room temperature'
  return { tag }
}

// Where an add draws from. A reagent that IS the sample (samples, blood, lysate, serum,
// plasma — not "sample buffer") lives in a tube: 'sample_tube'. Collecting samples fills
// the vessel from outside the bench: 'none' (no source drawn, no bottle invented).
// Otherwise the reagent's own bottle: 'bottle'.
const SAMPLE_REAGENT = /\b(samples?|blood|lysates?|serum|plasma)\b(?!\s+buffer)/i
export function addSource(step) {
  const text = `${step?.text_en || ''} ${step?.text || ''}`
  if (/\bcollect\b[^.]*\bsamples?\b/i.test(text)) return 'none'
  const names = (step?.reagents || []).map((r) => `${r?.name_en || ''} ${r?.name || ''}`)
  if (names.some((n) => SAMPLE_REAGENT.test(n))) return 'sample_tube'
  return 'bottle'
}
