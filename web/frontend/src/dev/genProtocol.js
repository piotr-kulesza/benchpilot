// genProtocol.js — SYNTHETIC PROTOCOLS nobody has seen: random, well-formed sequences of the
// supported verbs, vessels and volumes (the schema core/schema.py emits), from a fixed seed. The
// scene must hold up on every one of them (scripts/check-protocol.mjs --generated N).
//
// Edge cases are drawn on purpose: 0.5 µl, 200 µl, 201 µl, 1000 µl, 1001 µl (each still ONE draw —
// schematic pipetting), 50 mL (poured), unstated / symbolic / relative volumes,
// repeated additions of one reagent, discards, spins with "discard the flow-through", side mixes
// drawn from later, unknown verbs and an unknown vessel. Pure — no DOM.

export const EDGE_VOLUMES = ['0.5 µl', '200 µl', '201 µl', '1000 µl', '1001 µl', '50 mL']
const OTHER_VOLUMES = ['10 µl', '80 µl', '350 µl', '500 µl', '1.5 mL', '2 mL', '25 mL', '30–50 µl', 'one volume', 'X µl', null]
const REAGENTS = ['PBS', 'Lysis buffer', 'Wash buffer', '70% ethanol', 'Nuclease-free water', 'Primary antibody',
  'Blocking buffer', 'Trypsin', 'Culture medium', 'Substrate solution', 'Stop solution', 'Elution buffer', 'Crystal violet']

export function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// what can happen to a sample in each vessel (the verbs the scene models for it)
const VERBS = {
  microtube: ['pour_add', 'pour_add', 'centrifuge', 'incubate_wait', 'heat', 'cool_ice', 'pipette_mix', 'discard', 'transfer', 'prepare', 'thermocycle', 'measure', 'store'],
  tube: ['pour_add', 'pour_add', 'centrifuge', 'incubate_wait', 'heat', 'cool_ice', 'discard', 'transfer', 'prepare', 'measure', 'store'],
  cryovial: ['pour_add', 'store', 'cool_ice', 'measure'],
  spin_column: ['pour_add', 'pour_add', 'centrifuge', 'centrifuge', 'incubate_wait', 'elute'],
  eluate_tube: ['measure', 'store', 'cool_ice', 'pour_add'],
  well_plate: ['pour_add', 'pour_add', 'incubate_wait', 'discard', 'measure', 'prepare'],
  flask: ['pour_add', 'discard', 'incubate_wait', 'measure', 'transfer', 'store'],
  dish: ['pour_add', 'discard', 'incubate_wait', 'measure'],
  slide: ['pour_add', 'stain', 'heat', 'incubate_wait', 'measure'],
  membrane: ['pour_add', 'pour_add', 'discard', 'incubate_wait'],
  gel: ['pour_add', 'electrophorese', 'measure'],
  agar_plate: ['seed', 'incubate_wait'],
}
const TRANSFER_TO = { microtube: ['spin_column', 'tube', 'cryovial'], tube: ['microtube', 'spin_column'], flask: ['tube'] }
const STARTS = ['microtube', 'microtube', 'tube', 'spin_column', 'well_plate', 'flask', 'dish', 'slide', 'membrane', 'gel', 'agar_plate', 'cryovial']

export function generateProtocol(seed, { minSteps = 6, maxSteps = 12 } = {}) {
  const r = rng(seed * 7919 + 13)
  const pick = (xs) => xs[Math.floor(r() * xs.length)]
  const vol = () => (r() < 0.45 ? pick(EDGE_VOLUMES) : pick(OTHER_VOLUMES))
  let vessel = STARTS[seed % STARTS.length]
  const n = minSteps + Math.floor(r() * (maxSteps - minSteps + 1))
  const steps = []
  const mixes = []                       // side mixes made, not yet drawn from
  let lastReagent = null
  const step = (action, extra = {}) => {
    const s = {
      index: steps.length + 1, phase: 'procedure', kind: 'action', action, container: vessel,
      text: extra.text || `${action.replace('_', ' ')} (${vessel})`, target: null, produces: null, draws_from: null,
      duration_seconds: null, spin: null, reagents: [], conditionals: [], repeat: null, alternatives: [],
      hazards: [], prep_ahead: false, gaps: [],
      conditions: { temperature_c: null, room_temperature: false, on_ice: false, agitation: false, instruments: [] },
      ...extra,
    }
    s.text_en = s.text; s.verbatim = s.text; s.hazards_en = []
    steps.push(s)
    return s
  }
  const reagent = (name, volume) => ({ name, name_en: name, volume, volume_en: volume, condition: null, condition_en: null })
  for (let i = 0; i < n; i++) {
    // an unknown verb now and then (the scene must show the bench, flagged — never a guess)
    if (r() < 0.06) { step(pick(['vortex', 'sonicate', 'filter']), { reagents: [], duration_seconds: 30 }); continue }
    const verbs = VERBS[vessel] || ['pour_add']
    let a = pick(verbs)
    if (a === 'pour_add' && mixes.length && r() < 0.5) {
      const m = mixes.shift()
      step('pour_add', { draws_from: m, reagents: [reagent(`${m} mix`, vol())], text: `Apply the ${m} mix` })
      continue
    }
    switch (a) {
      case 'pour_add': {
        // a repeated addition of the reagent just added, or one or two new ones
        const repeat = lastReagent && r() < 0.3
        const k = repeat ? 1 : 1 + (r() < 0.25 ? 1 : 0)
        const rs = Array.from({ length: k }, (_, j) => reagent(repeat && j === 0 ? lastReagent : pick(REAGENTS), vol()))
        lastReagent = rs[0].name
        step('pour_add', { reagents: rs, text: `Add ${rs.map((x) => `${x.volume || 'some'} ${x.name}`).join(' and ')}` })
        break
      }
      case 'centrifuge': {
        const d = pick([15, 60])
        step('centrifuge', { duration_seconds: d, spin: { duration_seconds: d, rcf_min: pick([null, 8000, 12000]), note: vessel === 'spin_column' && r() < 0.6 ? 'discard the flow-through' : null }, text: `Centrifuge for ${d} s` })
        break
      }
      case 'incubate_wait': step('incubate_wait', { duration_seconds: pick([60, 300]), conditions: { temperature_c: pick([null, 37]), room_temperature: r() < 0.5, on_ice: false, agitation: false, instruments: [] } }); break
      case 'heat': step('heat', { duration_seconds: 120, conditions: { temperature_c: pick([56, 65, 95]), room_temperature: false, on_ice: false, agitation: false, instruments: [] } }); break
      case 'cool_ice': step('cool_ice', { duration_seconds: 60, conditions: { temperature_c: 0, room_temperature: false, on_ice: true, agitation: false, instruments: [] } }); break
      case 'store': step('store', { conditions: { temperature_c: pick([-20, -80, 4]), room_temperature: false, on_ice: false, agitation: false, instruments: [] }, text: 'Store the sample' }); i = n; break
      case 'measure': step('measure', { text: 'Measure the concentration' }); break
      case 'pipette_mix': step('pipette_mix', { text: 'Mix by pipetting up and down' }); break
      case 'thermocycle': step('thermocycle', { text: 'Run the PCR program' }); break
      case 'electrophorese': step('electrophorese', { duration_seconds: 120, text: 'Run the gel' }); break
      case 'stain': step('stain', { reagents: [reagent('Crystal violet', vol())], duration_seconds: 60 }); break
      case 'seed': step('seed', { reagents: [reagent('Bacterial culture', vol())], text: 'Spread the culture on the plate' }); break
      case 'discard': step('discard', { text: pick(['Discard the supernatant', 'Aspirate and discard the medium', 'Discard the flow-through']) }); break
      case 'elute': {
        vessel = 'eluate_tube'
        step('elute', { reagents: [reagent('Elution buffer', pick(['30–50 µl', '50 µl', '200 µl', '201 µl']))], duration_seconds: 60, spin: { duration_seconds: 60, rcf_min: 8000, note: null } })
        break
      }
      case 'transfer': {
        const to = TRANSFER_TO[vessel]
        if (!to) { step('measure'); break }
        vessel = pick(to)
        step('transfer', { text: `Transfer the sample to a ${vessel.replace('_', ' ')}` })
        break
      }
      case 'prepare': {
        const id = `mix_${steps.length + 1}`
        const k = 2 + (r() < 0.4 ? 1 : 0)
        const prev = vessel
        const st = step('prepare', { produces: id, target: id, container: 'tube', reagents: Array.from({ length: k }, () => reagent(pick(REAGENTS), vol())), text: `Prepare the ${id} mix` })
        vessel = prev; st.container = 'tube'
        mixes.push(id)
        break
      }
      default: step('generic')
    }
  }
  // an unknown vessel now and then (rendered as the honest fallback)
  if (seed % 17 === 0 && steps.length) steps[Math.floor(steps.length / 2)].container = 'beaker'
  return { title: `Synthetic protocol #${seed}`, title_en: `Synthetic protocol #${seed}`, summary: '', summary_en: '', source: `genProtocol seed ${seed}`, materials: [], steps, open_parameters: [], reference: null }
}
