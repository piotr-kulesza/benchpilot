// liquidLedger.js — how much liquid is in every vessel at the start and end of every station.
//
// THIS FIRST VERSION IS THE CURRENT SCENE'S BEHAVIOUR, extracted verbatim (StationScene's
// stepEnd fold: a level per action, colours replaced not mixed, a 0.8 tip on every pass), so
// the proofs in liquidLedger.test.js run against what the runner draws today. Levels are read
// back as µl through each vessel's drawn shape (liquidShape.js).
import { containerContract, transferKind } from './containerContract.js'
import { resolveRecipe } from './sceneRecipe.js'
import { effectiveStep } from '../lib/runtime.js'
import { tubeShape, columnShape, linearShape, tipShape, volumeAt } from '../scene/liquidShape.js'

export const TIP_UL = 200

const SHAPES = {
  tube: tubeShape(1.7, 0.32), elu: tubeShape(1.15, 0.26), column: columnShape(), prep: tubeShape(1.7, 0.34),
  cryovial: linearShape(2000, 1), wellplate: linearShape(360, 1), flask: linearShape(70000, 3.375), dish: linearShape(80000, 1.42),
  slide: linearShape(1000, 1), membrane: linearShape(1000, 1), gel: linearShape(1000, 1), agarplate: linearShape(1000, 1),
}
export const shapeOf = (id) => SHAPES[id] || (String(id).startsWith('prep:') ? SHAPES.prep : SHAPES.tube)
const ulOf = (id, level) => volumeAt(shapeOf(id), Math.max(0, level))

const INIT_COLOR = 0xb8b2a6, INIT_LEVEL = 0.3
function stepEnd(action, prev, color, fill) {
  switch (action) {
    case 'pour_add': return { color, level: Math.max(prev.level, fill) }
    case 'pipette_mix': return { color, level: prev.level }
    case 'transfer': return { color: prev.color, level: 0.9 }
    case 'centrifuge': return { color: prev.color, level: 0.2 }
    case 'elute': return { color, level: 0.45 }
    case 'discard': return { color: prev.color, level: 0.05 }
    case 'seed': return { color, level: Math.max(prev.level, fill) }
    case 'stain': return { color, level: Math.max(prev.level, fill) }
    default: return { color: prev.color, level: prev.level }
  }
}

// the pipette's tip: the builder fill it is drawn at for a draw of `ul`
export function tipPlan() { return { fill: 0.8 } }
export const tipUl = (fill) => volumeAt(tipShape(), fill)

export function buildLedger(steps, { containers = [], altByStep = {}, colorOf = () => 0x02b6a0 } = {}) {
  let color = INIT_COLOR, level = INIT_LEVEL
  const stations = steps.map((s, i) => {
    const eff = effectiveStep(s, altByStep[s.index] || 0)
    const prim = (eff.reagents || []).find((r) => r.volume) || (eff.reagents || [])[0]
    const c = colorOf(prim ? (prim.name_en || prim.name) : null)
    const f = resolveRecipe(eff.action).anim.fill
    const vessel = containerContract(containers[i] || 'microtube').vessel
    const rec = { index: s.index, action: eff.action, vessel, start: {}, end: {}, ops: [], flags: [] }
    const put = (id, a, b) => { rec.start[id] = { ul: ulOf(id, a.level), color: a.color }; rec.end[id] = { ul: ulOf(id, b.level), color: b.color } }
    if (eff.action === 'prepare') {
      const held = { color, level }
      put(vessel, held, held)
      put('prep:' + (eff.produces || i), { color: c, level: 0 }, { color: c, level: 0.62 })
      return rec
    }
    const start = { color, level }
    const end = stepEnd(eff.action, start, c, f)
    const prev = i > 0 ? (containers[i - 1] || 'microtube') : null
    const kind = eff.action === 'transfer' ? transferKind(prev, containers[i]) : null
    if (kind === 'contents') {
      const from = containerContract(prev).vessel
      put(from, start, { color: end.color, level: 0.03 }); put(vessel, { color: end.color, level: 0.03 }, end)
    } else if (kind === 'nest') {
      put(containerContract(prev).vessel, start, start); put(vessel, { color: start.color, level: 0 }, { color: start.color, level: 0 })
    } else if (eff.action === 'centrifuge' || eff.action === 'elute') {
      put(vessel, { color: end.color, level: start.level }, end)   // stationSpin enters in the END colour
    } else put(vessel, start, end)
    if (eff.draws_from) put('prep:' + eff.draws_from, { color: c, level: 0.62 }, { color: c, level: 0.1 })
    color = end.color; level = end.level
    return rec
  })
  return { stations, flags: [] }
}
