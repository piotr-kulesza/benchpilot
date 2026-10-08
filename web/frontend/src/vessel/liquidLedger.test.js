// The liquid proofs. Every vessel's volume at every station comes from ONE ledger
// (liquidLedger.js); these hold it to the protocol: liquid is conserved, two equal adds
// double, every station starts where the last one ended, a tip never holds more than it drew,
// and every volume the text does not state is reported.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildLedger, mixColor } from './liquidLedger.js'
import { generateProtocol } from '../dev/genProtocol.js'
import { sampleContainerSequence } from './sceneRecipe.js'
import { parseVolume } from '../lib/volume.js'
import { partitionSteps } from '../lib/runtime.js'
import { innerRadiusFn, liquidProfileGeo, tubeProfile, tubeShape, levelFor } from '../scene/liquidShape.js'

const DIR = path.resolve(__dirname, '../../public/protocols')
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => ({ id: f.replace('.json', ''), ...JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) }))
// every protocol twice: all its steps, and the runner's stations (do-ahead preps and notes off the bench)
const PROTOCOLS = [...FILES, ...FILES.map((p) => ({ ...p, id: p.id + ' (runner)', steps: partitionSteps(p.steps).stations }))]
const colorOf = (name) => (name ? [...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) & 0xffffff : 0x02b6a0)
const ledgerOf = (steps) => buildLedger(steps, { containers: sampleContainerSequence(steps), colorOf })
const EPS = 1e-6
const ulIn = (side, id) => (side[id] ? side[id].ul : 0)
const total = (side) => Object.values(side).reduce((a, v) => a + v.ul, 0)

// replay a station's ops on its start state: what the ledger SAYS happened must produce its end
function replay(st) {
  const m = {}
  for (const [id, v] of Object.entries(st.start)) m[id] = { ...v }
  const get = (id) => (m[id] ||= { ul: 0, color: null })
  let added = 0, removed = 0
  for (const op of st.ops) {
    if (op.op === 'add') { const t = get(op.to); t.color = mixColor(t.color, t.ul, op.color, op.ul); t.ul += op.ul; added += op.ul }
    else if (op.op === 'move') { const f = get(op.from), t = get(op.to); t.color = mixColor(t.color, t.ul, f.color, op.ul); f.ul -= op.ul; t.ul += op.ul }
    else if (op.op === 'discard' || op.op === 'retire') { get(op.from).ul -= op.ul; removed += op.ul }
  }
  return { m, added, removed }
}

describe('conservation — liquid changes only by explicit additions and discards', () => {
  for (const p of PROTOCOLS) {
    it(`${p.id}: every station's ops, replayed on its start, give its end`, () => {
      const L = ledgerOf(p.steps)
      for (const st of L.stations) {
        const { m, added, removed } = replay(st)
        for (const id of new Set([...Object.keys(m), ...Object.keys(st.end)])) {
          expect(ulIn(st.end, id), `${p.id} step ${st.index} ${id}`).toBeCloseTo(m[id] ? m[id].ul : 0, 6)
          expect(ulIn(st.end, id)).toBeGreaterThanOrEqual(-EPS)
        }
        expect(total(st.end), `${p.id} step ${st.index} total`).toBeCloseTo(total(st.start) + added - removed, 6)
      }
    })
  }
})

describe('continuity — a station starts with exactly what the last one ended with', () => {
  for (const p of PROTOCOLS) {
    it(`${p.id}: volume and colour carry from station n to n+1`, () => {
      const L = ledgerOf(p.steps)
      for (let i = 0; i + 1 < L.stations.length; i++) {
        const a = L.stations[i].end, b = L.stations[i + 1].start
        for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const where = `${p.id} ${L.stations[i].index}→${L.stations[i + 1].index} ${id}`
          expect(ulIn(b, id), where).toBeCloseTo(ulIn(a, id), 6)
          if (ulIn(a, id) > EPS) expect(b[id].color, where).toBe(a[id].color)
        }
      }
    })
  }
})

// the drawn liquid: the volume of the mesh the tube builder actually draws
function meshVolume(geo) {
  const pos = geo.attributes.position, idx = geo.index
  const n = idx ? idx.count : pos.count
  let v = 0
  const P = (k) => { const j = idx ? idx.getX(k) : k; return [pos.getX(j), pos.getY(j), pos.getZ(j)] }
  for (let k = 0; k < n; k += 3) {
    const [a, b, c] = [P(k), P(k + 1), P(k + 2)]
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return Math.abs(v)
}
const H = 1.7, R = 0.32
const drawnUl = (ul) => {
  const shape = tubeShape(H, R), inner = innerRadiusFn(tubeProfile(H, R), 0.9)
  const y = (lv) => 0.03 + lv * (H * 0.9 - 0.03)
  const full = meshVolume(liquidProfileGeo(inner, 0.03, y(1), 48))
  return shape.capacityUl * meshVolume(liquidProfileGeo(inner, 0.03, y(levelFor(shape, ul)), 48)) / full
}

describe('doubling — two equal dispenses into an empty tube give twice one', () => {
  const add = (i) => ({ index: i, action: 'pour_add', container: 'microtube', target: 'sample', text_en: 'Add 100 µl water.',
    reagents: [{ name: 'Woda', name_en: 'water', volume: '100 µl', volume_en: '100 µl' }] })
  const L = ledgerOf([add(1), add(2)])
  const one = L.stations[0].end.tube.ul, two = L.stations[1].end.tube.ul
  it('the ledger: 100 µl, then 200 µl', () => {
    expect(one).toBeCloseTo(100, 6)
    expect(two).toBeCloseTo(2 * one, 6)
  })
  it('the drawn liquid mesh holds the ledger volume within 2 %', () => {
    for (const ul of [one, two]) expect(Math.abs(drawnUl(ul) - ul) / ul).toBeLessThan(0.02)
    expect(drawnUl(two) / drawnUl(one)).toBeCloseTo(2, 1)
  })
})

// SCHEMATIC PIPETTING: one pipette (the P200); each substance a step adds is ONE draw from its own
// source and one dispense, whatever its volume; a discard or a move is one draw; nothing is split into
// passes, nothing is capped
const GENERATED = Array.from({ length: 50 }, (_, k) => ({ id: `gen-${k + 1}`, ...generateProtocol(k + 1) }))
describe('schematic pipetting — one draw per substance', () => {
  for (const p of [...PROTOCOLS, ...GENERATED]) {
    it(`${p.id}: every pipetted op is one draw, no substance is drawn twice in a step`, () => {
      for (const st of ledgerOf(p.steps).stations) {
        const at = `${p.id} step ${st.index}`
        const piped = st.ops.filter((o) => o.method === 'pipette')
        for (const op of piped) {
          expect(op.passes ?? 1, at).toBe(1)
          expect(op.pipette == null || op.pipette === 'P200', at).toBe(true)
        }
        const names = st.ops.filter((o) => o.op === 'add').map((o) => `${o.to}:${o.name}`)
        expect(new Set(names).size, `${at}: ${names}`).toBe(names.length)
      }
    })
  }
  it('a vessel holds what was added — 50 mL into a microtube is 50 mL (no cap)', () => {
    const steps = [{ index: 1, action: 'pour_add', container: 'microtube', text: 'Add 50 mL PBS', text_en: 'Add 50 mL PBS', reagents: [{ name: 'PBS', name_en: 'PBS', volume: '50 mL', volume_en: '50 mL' }], conditionals: [], alternatives: [], hazards: [], conditions: {} }]
    const L = ledgerOf(steps)
    expect(L.stations[0].end.tube.ul).toBeCloseTo(50000, 3)
  })
})

describe('neutrophil_rna — the volumes the protocol states', () => {
  const p = FILES.find((x) => x.id === 'neutrophil_rna')
  const L = ledgerOf(p.steps)
  const at = (index) => L.stations.find((s) => s.index === index)
  it('lysis 350 µl, + one volume of ethanol = 700 µl, loaded onto the column', () => {
    expect(at(5).end.tube.ul).toBeCloseTo(350, 6)
    expect(at(7).end.tube.ul).toBeCloseTo(700, 6)
    expect(at(8).end.column.ul).toBeCloseTo(700, 6)
    expect(ulIn(at(8).end, 'tube')).toBeCloseTo(0, 6)
  })
  it('a spin moves the column into its collection tube; "discard the flow-through" pours it off at the bench next', () => {
    expect(at(9).ops.some((o) => o.op === 'move' && o.from === 'column' && o.to === 'flow' && Math.abs(o.ul - 700) < EPS)).toBe(true)
    expect(ulIn(at(9).end, 'column')).toBeCloseTo(0, 6)
    expect(ulIn(at(9).end, 'flow')).toBeCloseTo(700, 6)
    expect(at(10).ops[0]).toMatchObject({ op: 'discard', from: 'flow', to: 'waste' })
    expect(ulIn(at(10).end, 'flow')).toBeCloseTo(0, 6)
    expect(at(17).end.flow.ul).toBeCloseTo(500, 6)            // "Centrifuge 15 s." — kept
    expect(at(19).end.flow.ul).toBeCloseTo(1000, 6)
  })
  it('the DNase mix is used up; the elution moves the 40 µl (30–50 µl midpoint) into the eluate tube', () => {
    expect(at(12).end.column.ul).toBeCloseTo(80, 6)
    expect(ulIn(at(12).end, 'prep:dnase_mix')).toBeCloseTo(0, 6)
    expect(at(22).end.column.ul).toBeCloseTo(40, 6)
    expect(at(24).end.elu.ul).toBeCloseTo(40, 6)
    expect(ulIn(at(24).end, 'column')).toBeCloseTo(0, 6)
  })
})

describe('every volume the text does not state is reported', () => {
  for (const p of PROTOCOLS) {
    it(`${p.id}: each station with an unstated reagent volume carries a flag`, () => {
      const L = ledgerOf(p.steps)
      for (const st of L.stations) {
        const step = p.steps.find((s) => s.index === st.index)
        const unstated = (step.reagents || []).some((r) => ['unknown'].includes(parseVolume(r.volume_en ?? r.volume).kind))
        if (unstated) expect(st.flags.length, `${p.id} step ${st.index}`).toBeGreaterThan(0)
      }
    })
  }
})
