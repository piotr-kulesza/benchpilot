// liquidLedger.js — THE one source of truth for how much liquid is in every vessel at the
// start and end of every station, and how it got there. Pure: steps in, numbers out.
//
// A vessel is a PHYSICAL object of the bench line (the sample's tube, the spin column, its
// collection tube 'flow', the eluate tube, a prepared mix 'prep:<id>', …). Every change is an
// explicit op, applied in order, so the record replays exactly:
//   add     { to, ul, color, from: 'bottle' | 'prep:<id>' | 'outside' | 'sample_tube', method }
//   move    { from, to, ul, method }            liquid goes from one vessel to another
//   discard { from, ul }                        to waste ("discard the flow-through", aspirate)
//   retire  { from, ul }                        the vessel leaves the line with what it holds
// Colours mix by volume. Reagent bottles are unlimited sources. The rules for volumes the text
// does not pin down (CLAUDE.md "Liquid ledger") are applied here, and every station whose
// volume could not be read from the text carries a flag.
import { containerContract, transferKind } from './containerContract.js'
import { addSource } from './sceneRecipe.js'
import { effectiveStep } from '../lib/runtime.js'
import { parseVolume } from '../lib/volume.js'
import { tubeShape, columnShape, collectionShape, linearShape, tipShape, levelFor, volumeAt } from '../scene/liquidShape.js'

export const TIP_UL = 200              // the pipette is drawn as a P200 (its own decal): one tip holds 200 µl
export const PIPETTE_MAX_UL = 1000     // up to 1 mL is pipetted in passes of one tip (≤ 5); a mL pipette move is drawn as one pass
export const POUR_MIN_UL = 50000       // ≥ 50 mL (or a step that says pour / rinse) is poured from its bottle — as the scene always has
export const POUR_UL_PER_S = 10000     // a pour runs at 10 mL/s — its stream lasts volume / rate
export const PLACEHOLDER_FRACTION = 0.1 // an unstated volume: 10 % of the receiving vessel's nominal capacity
export const FLASK_AREA_CM2 = 25       // "per 10 cm²" is read against a T-25 (est: the drawn T-flask)
export const INIT_COLOR = 0xb8b2a6     // the sample before anything is added

// each vessel's drawn shape + nominal capacity (liquidShape.js). Surfaces (slide, membrane, gel,
// agar plate) have no drawn interior — their volume is kept, never drawn.
const SHAPES = {
  tube: tubeShape(1.7, 0.32), elu: tubeShape(1.15, 0.26), column: columnShape(), flow: collectionShape(), prep: tubeShape(1.7, 0.34),
  cryovial: linearShape(2000, 1), wellplate: linearShape(360, 1), flask: linearShape(70000, 3.375), dish: linearShape(80000, 1.42),
}
// surfaces: est. what each holds when flooded — only used to size an unstated volume
const SURFACE_UL = { slide: 1000, membrane: 25000, gel: 50, agarplate: 1000 }
export const isSurface = (id) => id in SURFACE_UL
export const shapeOf = (id) => SHAPES[id] || (String(id).startsWith('prep:') ? SHAPES.prep : null)
export const nominalUl = (id) => (shapeOf(id) ? shapeOf(id).capacityUl : SURFACE_UL[id] || 1500)

// colour mixing by volume (sRGB channels weighted by µl)
export function mixColor(c1, u1, c2, u2) {
  if (c1 == null || !(u1 > 0)) return c2
  if (c2 == null || !(u2 > 0)) return c1
  const ch = (c, s) => (c >> s) & 255, w = u1 + u2
  const mix = (s) => Math.round((ch(c1, s) * u1 + ch(c2, s) * u2) / w)
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
}

// the tip: drawn to the volume it holds (never a full tip for a few µl)
export function tipPlan(ul) { return { fill: levelFor(tipShape(), Math.min(Math.max(ul, 0), TIP_UL)) } }
export const tipUl = (fill) => volumeAt(tipShape(), fill)
export const passesFor = (ul) => Math.max(1, Math.ceil(ul / TIP_UL - 1e-9))

const NOT_LIQUID = /\b(plate|powder|pellet)\b/i
const ADDS = new Set(['pour_add', 'seed', 'stain', 'pipette_mix'])
const RINSE = /\brins|run-?off/i
const DISCARD_FLOW = /discard|odrzuci/i

export function buildLedger(steps, { containers = [], altByStep = {}, colorOf = () => 0x02b6a0 } = {}) {
  const eff = steps.map((s) => effectiveStep(s, altByStep[s.index] || 0))
  const vesselAt = (i) => containerContract(containers[i] || 'microtube').vessel
  const produced = new Set(eff.filter((s) => s.action === 'prepare' && s.produces).map((s) => s.produces))
  const nameOf = (r) => r.name_en || r.name || ''
  // one entry per reagent NAME (a conditional volume — 350 µl / 600 µl — is the same reagent):
  // the first variant, which is the one the station's title states
  const distinct = (rs) => { const seen = new Set(); return (rs || []).filter((r) => { const n = nameOf(r); if (seen.has(n)) return false; seen.add(n); return true }) }
  const variants = (rs, r) => (rs || []).filter((x) => nameOf(x) === nameOf(r)).length
  const readVol = (r) => parseVolume(r.volume_en ?? r.volume)

  // what is later DRAWN from each mix made on the bench — sizes a mix whose volume is unstated
  const drawn = {}
  eff.forEach((s) => {
    if (!s.draws_from || !produced.has(s.draws_from)) return
    const v = distinct(s.reagents).map(readVol).find((x) => x.ul != null)
    if (v) drawn[s.draws_from] = (drawn[s.draws_from] || 0) + v.ul
  })

  // a tube's size, when the text names it ("a 15 mL conical tube"), is its nominal capacity
  const capacity = {}
  eff.forEach((s, i) => {
    const t = (s.text_en || s.text || '').match(/(\d+(?:\.\d+)?)\s*-?\s*m[lL]\s+(?:conical\s+|falcon\s+|centrifuge\s+)*tube/)
    if (t && vesselAt(i) === 'tube') capacity.tube = Number(t[1]) * 1000
  })
  const cap = (id) => capacity[id] || nominalUl(id)

  const m = {}                                  // id → { ul, color }
  const get = (id) => (m[id] ||= { ul: 0, color: null })
  const snap = () => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ul: v.ul, color: v.color }]))
  const lastUse = {}                            // prep id → last station that draws from it
  eff.forEach((s, i) => { if (s.draws_from && produced.has(s.draws_from)) lastUse[s.draws_from] = i })
  const history = []                            // every add so far (for "twice the volume of X")

  // ── the sample before the first station: a vessel the first sample step ADDS into starts empty;
  // a pellet is a solid (0 µl of liquid); anything else is unstated → the placeholder, flagged
  const first = eff.findIndex((s) => s.action !== 'prepare' && s.action !== 'generic')
  const initFlags = []
  if (first >= 0) {
    const v0 = vesselAt(first), s0 = eff[first]
    const firstAdd = eff.findIndex((s, i) => i >= first && ADDS.has(s.action) && (s.reagents || []).length)
    let ul = 0
    if (firstAdd === first) ul = 0
    else if (firstAdd >= 0 && !eff.slice(first, firstAdd).some((s) => s.action === 'centrifuge') && /pellet|osad/i.test(`${eff[firstAdd].text_en || ''} ${eff[firstAdd].text || ''}`)) initFlags.push('starts as a pellet: a solid, 0 µl of liquid until the first addition')
    else { ul = PLACEHOLDER_FRACTION * cap(v0); initFlags.push(`starting contents not stated: placeholder ${fmt(ul)} (10 % of the ${v0})`) }
    m[v0] = { ul, color: INIT_COLOR }
    void s0
  }

  let pendingDiscard = false
  const stations = eff.map((s, i) => {
    const rec = { index: s.index, action: s.action, vessel: vesselAt(i), start: snap(), end: null, ops: [], flags: i === Math.max(first, 0) ? [...initFlags] : [], notes: [] }
    const flag = (t) => rec.flags.push(t)
    const note = (t) => rec.notes.push(t)
    const op = (o) => {
      if (o.op === 'retire' && !(get(o.from).ul > 1e-12)) { delete m[o.from]; return }
      if (!(o.ul > 1e-12) && o.op !== 'retire') return
      if (o.op === 'add') { const t = get(o.to); t.color = mixColor(t.color, t.ul, o.color, o.ul); t.ul += o.ul; history.push(o) }
      else if (o.op === 'move') { const f = get(o.from), t = get(o.to); t.color = mixColor(t.color, t.ul, f.color, o.ul); f.ul -= o.ul; t.ul += o.ul; o.color = f.color }
      else { const f = get(o.from); o.ul = o.op === 'retire' ? f.ul : o.ul; f.ul -= o.ul; if (o.op === 'retire') delete m[o.from] }
      rec.ops.push(o)
    }
    const text = `${s.text_en || ''} ${s.text || ''}`
    const here = rec.vessel
    if (pendingDiscard && m.column && s.action !== 'centrifuge' && s.action !== 'elute' && get('flow').ul > 0) {
      op({ op: 'discard', from: 'flow', ul: get('flow').ul, method: 'pour', to: 'waste', why: 'the flow-through, poured off (discarded at the last spin)' })
      rec.flowDiscard = rec.ops[rec.ops.length - 1].ul
      pendingDiscard = false
    }
    const prevV = i > 0 ? vesselAt(i - 1) : null
    const prevC = i > 0 ? (containers[i - 1] || 'microtube') : null

    // the volume a reagent line states, as µl added to `to` (null = not a liquid)
    const resolve = (r, to, opts = {}) => {
      const v = readVol(r)
      const nm = nameOf(r)
      if (variants(s.reagents, r) > 1) note(`${nm}: conditional volume — the first variant (${r.volume_en ?? r.volume}) is drawn`)
      if (v.kind === 'solid' || NOT_LIQUID.test(nm)) { (v.kind === 'unknown' ? flag : note)(`${nm}: not a liquid — no volume added`); return null }
      if (v.kind === 'exact' || v.kind === 'per') return v.ul
      if (v.kind === 'range') { note(`${nm}: ${v.raw} → midpoint ${fmt(v.ul)}`); return v.ul }
      if (v.kind === 'per_area') { const ul = v.ulPerCm2 * FLASK_AREA_CM2; flag(`${nm}: "${v.raw}" — read against a ${FLASK_AREA_CM2} cm² T-25 (the flask's area is not stated): ${fmt(ul)}`); return ul }
      if (v.kind === 'relative') {
        if (v.of) {
          const words = v.of.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
          const ref = [...history].reverse().find((h) => words.some((w) => String(h.name || '').toLowerCase().includes(w)))
          if (ref) { note(`${nm}: ${v.raw} → ${v.factor} × ${fmt(ref.ul)}`); return v.factor * ref.ul }
          flag(`${nm}: "${v.raw}" — no earlier ${v.of} to measure against`)
        }
        const ul = v.factor * get(to).ul
        note(`${nm}: ${v.raw} → ${v.factor} × the ${fmt(get(to).ul)} in the ${to}`)
        return ul
      }
      // unknown: a mix made here is sized to what is later drawn from it; else the placeholder
      if (opts.share != null) { flag(`${nm}: "${v.raw || 'no volume'}" — sized to what the protocol later draws from this mix: ${fmt(opts.share)}`); return opts.share }
      const ul = PLACEHOLDER_FRACTION * cap(to)
      flag(`${nm}: ${v.reason} — placeholder ${fmt(ul)} (10 % of the ${to})`)
      return ul
    }
    const methodFor = (ul) => (ul >= POUR_MIN_UL || /\b(pour|rins)/i.test(text) ? 'pour' : 'pipette')
    const pass = (o) => {
      if (o.method !== 'pipette') { delete o.passes; return o }
      if (o.ul > PIPETTE_MAX_UL) { flag(`a ${fmt(o.ul)} pipette move is drawn as one pass of the P200 (no serological pipette is modelled)`); return { ...o, passes: 1, serological: true } }
      return { ...o, passes: passesFor(o.ul) }
    }
    // a stated reagent volume that this action does not move is reported, never invented
    const flagUnstated = () => distinct(s.reagents).forEach((r) => { const v = readVol(r); if (v.kind === 'unknown') flag(`${nameOf(r)}: ${v.reason} (not moved by a ${s.action} step)`) })

    if (s.action === 'prepare') {
      // a SIDE MIX in its own fresh tube: each reagent from its bottle; the sample is untouched
      const id = 'prep:' + (s.produces || i)
      distinct(s.reagents).filter((r) => readVol(r).kind === 'solid' || NOT_LIQUID.test(nameOf(r))).forEach((r) => resolve(r, id))
      const rs = distinct(s.reagents).filter((r) => readVol(r).kind !== 'solid' && !NOT_LIQUID.test(nameOf(r)))
      const known = rs.map((r) => { const v = readVol(r); return v.ul != null && v.kind !== 'relative' ? v.ul : null })
      const sym = rs.map(readVol).find((v) => v.minusX != null)
      const unknownN = rs.filter((r, k) => known[k] == null && readVol(r).minusX == null && readVol(r).symbol == null).length
      const target = drawn[s.produces]
      get(id)
      rs.forEach((r, k) => {
        const v = readVol(r)
        let ul
        if (sym && (v.symbol === 'X' || v.minusX != null)) {           // "X µl" + "A − X µl": X = A / 2
          ul = v.minusX != null ? v.minusX / 2 : sym.minusX / 2
          flag(`${nameOf(r)}: "${v.raw}" — X is not stated; X = ${fmt(sym.minusX / 2)} (half of ${fmt(sym.minusX)}), so the pair keeps its stated sum`)
        } else if (known[k] != null) ul = resolve(r, id)
        else {
          const knownSum = known.reduce((a, b) => a + (b || 0), 0)
          ul = resolve(r, id, target ? { share: Math.max(0, target - knownSum) / Math.max(1, unknownN) } : {})
        }
        if (ul) op(pass({ op: 'add', to: id, ul, color: colorOf(nameOf(r)), name: nameOf(r), ri: distinct(s.reagents).indexOf(r), from: 'bottle', method: methodFor(ul) }))
      })
    } else if (s.action === 'transfer') {
      const kind = transferKind(prevC, containers[i])
      if (kind === 'nest') {
        // the column moves into a clean tube: its used collection tube (and the flow-through in
        // it) is set aside; the new one starts empty
        if (m.flow) op({ op: 'retire', from: 'flow' })
        if (get(here).ul > 1e-9) flag(`the clean ${here} already holds ${fmt(get(here).ul)}`)
        get('flow')
      } else if ((kind === 'contents' || kind === 'place') && prevV && prevV !== here) {
        const stated = distinct(s.reagents).map(readVol).find((v) => v.ul != null)
        const avail = get(prevV).ul
        let ul = stated ? stated.ul : avail
        if (ul > avail + 1e-9) { flag(`${fmt(ul)} stated, but the ${prevV} holds ${fmt(avail)} — ${fmt(avail)} moved`); ul = avail }
        const room = shapeOf(here) ? cap(here) - get(here).ul : Infinity
        if (ul > room + 1e-9) { flag(`${fmt(ul)} exceeds the ${here}'s ${fmt(cap(here))} — ${fmt(room)} loaded, the rest stays in the ${prevV}`); ul = room }
        op(pass({ op: 'move', from: prevV, to: here, ul, method: kind === 'place' ? 'place' : 'pipette' }))
      } else note('nothing moves (same vessel)')
      flagUnstated()
    } else if (s.action === 'centrifuge' || s.action === 'elute') {
      if (prevV === 'column' && here !== 'column') {
        op({ op: 'move', from: 'column', to: here, ul: get('column').ul, method: 'spin' })     // elution: column → elution tube
      } else if (here === 'column') {
        op({ op: 'move', from: 'column', to: 'flow', ul: get('column').ul, method: 'spin' })   // flow-through
        if (s.repeat && /remain|pozosta/i.test(`${s.repeat.reason_en || ''} ${s.repeat.reason || ''}`)) {
          const src = Object.keys(m).find((k) => k !== 'column' && k !== 'flow' && !k.startsWith('prep:') && m[k].ul > 1e-9 && shapeOf(k))
          if (src && src !== here) {
            note(`repeat for the remaining ${fmt(m[src].ul)} in the ${src}`)
            op(pass({ op: 'move', from: src, to: 'column', ul: m[src].ul, method: 'pipette' }))
            op({ op: 'move', from: 'column', to: 'flow', ul: get('column').ul, method: 'spin' })
          }
        }
        // "discard the flow-through": poured off into the waste at the bench — the column is in the
        // rotor until the next station, so it happens at the start of the next station with the column
        if (DISCARD_FLOW.test(text) && get('flow').ul > 0) pendingDiscard = true
      }
    } else if (s.action === 'discard') {
      op({ op: 'discard', from: here, ul: get(here).ul, why: 'discard' })
    } else if (ADDS.has(s.action)) {
      const rs = distinct(s.reagents)
      const changed = prevV && prevV !== here
      if (!rs.length && changed && (s.action === 'pour_add' || s.action === 'seed')) {
        // "pour the agarose into the casting tray", "plate the transformation": the sample itself moves
        let from = prevV
        for (let j = i - 1; j >= 0 && (isSurface(from) || !(get(from).ul > 0)); j--) from = vesselAt(j)
        let ul = get(from).ul
        if (/some or all|część lub/i.test(text)) flag(`"some or all" — all ${fmt(ul)} moved`)
        else if (s.action === 'seed') {
          const want = PLACEHOLDER_FRACTION * cap(here)
          flag(`the seeded volume is not stated — placeholder ${fmt(Math.min(want, ul))} (10 % of the ${here}${want > ul ? `, capped at the ${fmt(ul)} in the ${from}` : ''})`)
          ul = Math.min(want, ul)
        }
        op(pass({ op: 'move', from, to: here, ul, method: s.action === 'seed' ? 'pipette' : 'pour' }))
      } else if (s.action === 'pipette_mix' && !rs.length) {
        rec.mixUl = Math.min(TIP_UL, 0.5 * get(here).ul)
        note(`mixing strokes draw ${fmt(rec.mixUl)} (half the volume, at most one tip)`)
      } else {
        const src = addSource({ text_en: s.text_en, text: s.text, reagents: rs })
        const from = s.draws_from && produced.has(s.draws_from) ? 'prep:' + s.draws_from : src === 'none' ? 'outside' : src === 'sample_tube' ? 'sample_tube' : 'bottle'
        const adds = rs.map((r, ri) => ({ r, ri, ul: resolve(r, here) })).filter((a) => a.ul)
        const pour = adds.some((a) => methodFor(a.ul) === 'pour') ? 'pour' : 'pipette'
        for (const { r, ri, ul } of adds) {
          let u = ul
          if (from.startsWith('prep:')) {
            const have = get(from).ul
            if (u > have + 1e-9) { flag(`${fmt(u)} drawn, but the ${from.slice(5)} mix holds ${fmt(have)} — ${fmt(have)} used`); u = have }
            op(pass({ op: 'move', from, to: here, ul: u, method: pour, name: nameOf(r), ri }))
          } else op(pass({ op: 'add', to: here, ul: u, color: colorOf(nameOf(r)), name: nameOf(r), ri, from, method: from === 'outside' ? 'collect' : pour }))
        }
        // a rinse over a SURFACE runs off: everything on it goes to waste
        if (isSurface(here) && RINSE.test(text) && get(here).ul > 0) op({ op: 'discard', from: here, ul: get(here).ul, why: 'runs off the surface' })
      }
    } else {
      flagUnstated()
    }
    // a carried mix is set aside after the last station that draws from it
    for (const [pid, li] of Object.entries(lastUse)) if (li === i && m['prep:' + pid]) op({ op: 'retire', from: 'prep:' + pid })
    for (const k of Object.keys(m)) {
      if (Math.abs(m[k].ul) < 1e-9) m[k].ul = 0
      if (shapeOf(k) && m[k].ul > cap(k) * (shapeOf(k).full > 1 ? 1 : 1) + 1e-6 && rec.ops.some((o) => o.to === k)) flag(`${fmt(m[k].ul)} exceeds the drawn ${k}'s nominal ${fmt(cap(k))} — drawn full`)
    }
    rec.pourSeconds = rec.ops.filter((o) => o.method === 'pour' && o.op !== 'discard').reduce((a, o) => a + o.ul, 0) / POUR_UL_PER_S
    rec.passes = rec.ops.filter((o) => o.method === 'pipette').reduce((a, o) => a + (o.passes || 1), 0)
    rec.end = snap()
    return rec
  })
  return { stations, capacity: Object.fromEntries(Object.keys(SHAPES).map((k) => [k, cap(k)])) }
}

export function fmt(ul) {
  if (ul >= 1000) return `${+(ul / 1000).toFixed(ul % 1000 ? 2 : 0)} mL`
  return `${+ul.toFixed(ul < 10 ? 2 : 1)} µl`
}
