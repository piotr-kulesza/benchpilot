// dims.js — the ONE place object size enters the scene. Reads dimensions.json (real-world
// millimetres with provenance) and hands out WORLD units: 1 world unit = WORLD_UNIT_MM mm.
// Pure: no three.js, no DOM.
import TABLE from './dimensions.json' with { type: 'json' }

export const WORLD_UNIT_MM = TABLE.world_unit_mm
export const mmToWorld = (mm) => mm / WORLD_UNIT_MM

const UNIT_KEYS = ['mm', 'ml', 'deg', 'count']
const PROVENANCE = ['src', 'est', 'derived']

function convert(v) {
  if (v && typeof v === 'object' && 'mm' in v) return mmToWorld(v.mm)
  if (v && typeof v === 'object') { for (const k of UNIT_KEYS) if (k in v) return v[k] }
  return v
}

// dims('microtube_1_5') → { height, diameter, wall, … } in WORLD units (angles in deg,
// volumes in ml, counts as-is), plus `id`, `shape`, `category`, `accepts`, and the derived
// `radius` / footprint `width`/`depth` for round items (both = diameter).
const cache = new Map()
export function dims(id) {
  if (cache.has(id)) return cache.get(id)
  const e = TABLE.items[id]
  if (!e) throw new Error(`dims: no entry "${id}" in dimensions.json`)
  const out = { id, shape: e.shape, category: e.category, name: e.name, accepts: e.accepts || [] }
  for (const [k, v] of Object.entries(e)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = convert(v)
  }
  if (out.diameter != null) {
    out.radius = out.diameter / 2
    if (out.width == null) out.width = out.diameter
    if (out.depth == null) out.depth = out.diameter
  }
  cache.set(id, Object.freeze(out))
  return out
}

// A layout clearance (world units), e.g. clearance('bench_gap').
export function clearance(key) {
  const v = TABLE.clearances[key]
  if (!v) throw new Error(`dims: no clearance "${key}"`)
  return mmToWorld(v.mm)
}

// The raw entry, with provenance — for audits and the scale sheet caption.
export function spec(id) { return TABLE.items[id] }
export const SPEC_IDS = Object.keys(TABLE.items)
export const SOURCES = TABLE.sources

// Every measurement in the table with its provenance kind — the test and the report use it
// to prove nothing was silently invented: each value has exactly one of src/est/derived.
export function provenanceRows() {
  const rows = []
  const visit = (owner, key, v) => {
    const unit = UNIT_KEYS.find((u) => u in v)
    const prov = PROVENANCE.filter((p) => p in v)
    rows.push({ owner, key, unit, value: unit ? v[unit] : undefined, prov, ref: prov.length === 1 ? v[prov[0]] : null })
  }
  for (const [id, e] of Object.entries(TABLE.items)) {
    for (const [k, v] of Object.entries(e)) if (v && typeof v === 'object' && !Array.isArray(v)) visit(id, k, v)
  }
  for (const [k, v] of Object.entries(TABLE.clearances)) if (!k.startsWith('_')) visit('clearances', k, v)
  return rows
}
