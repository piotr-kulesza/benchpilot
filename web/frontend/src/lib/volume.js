// volume.js — read a protocol's stated volume ("350 µl", "30–50 µl", "one volume",
// "10 µl per 1 ml RLT", "X µl") into microlitres, saying HOW it was read. Pure, no DOM.
//
// The rules (CLAUDE.md "Liquid ledger"):
//   • exact            "350 µl", "~50 µL", "1 ml", "25 mL"          → that volume
//   • range            "30–50 µl", "250-1,000 µl"                    → its MIDPOINT (40, 625)
//   • per a basis      "10 µl per 1 ml RLT", "10 µl per sample"      → the stated amount (for one
//                       basis: one sample, or the stated 1 ml it is mixed into)
//   • per an area      "2 mL per 10 cm2"                             → scaled to the vessel's area
//   • relative         "one volume" (= what the vessel holds), "twice the volume of X"
//   • unknown          "X µl", "minimal volume", "according to the kit", none at all
//                       → a fixed placeholder (the ledger's rule), and the station is flagged
//   • not a liquid     "1 g" (a solid), "1-10 µg/mL" (a concentration) → nothing is added

const UNIT = '(µl|μl|ul|µL|μL|uL|microlit(?:er|re)s?|ml|mL|millilit(?:er|re)s?|L|lit(?:er|re)s?)'
const NUM = '(\\d+(?:[.,]\\d+)?(?:,\\d{3})*)'
const toNum = (s) => Number(String(s).replace(/,(\d{3})\b/g, '$1').replace(',', '.'))
const toUl = (n, unit) => {
  const u = unit.toLowerCase()
  if (/^(µl|μl|ul|micro)/.test(u)) return n
  if (/^(ml|milli)/.test(u)) return n * 1000
  return n * 1e6
}
const WORD_NUM = { one: 1, an: 1, a: 1, equal: 1, two: 2, twice: 2, double: 2, three: 3, thrice: 3, half: 0.5 }

export function parseVolume(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return { kind: 'unknown', reason: 'no volume stated', raw: s }
  // a symbolic volume: "X µl", "20.7 - X µl"
  const sym = s.match(new RegExp(`^${NUM}\\s*[-−–]\\s*X\\s*${UNIT}`, 'i'))
  if (sym) return { kind: 'unknown', reason: `"${s}" depends on an unstated X`, minusX: toUl(toNum(sym[1]), sym[2]), raw: s }
  if (new RegExp(`^X\\s*${UNIT}`, 'i').test(s)) return { kind: 'unknown', reason: `"${s}" is an unstated X`, symbol: 'X', raw: s }
  // a concentration or a mass is not a volume
  if (new RegExp(`${NUM}\\s*(?:[-–]\\s*${NUM}\\s*)?(?:ng|µg|μg|ug|mg|g)\\s*/\\s*${UNIT}`, 'i').test(s)) return { kind: 'unknown', reason: `"${s}" is a concentration, not a volume`, raw: s }
  if (new RegExp(`^${NUM}\\s*(?:mg|g|kg)\\b`, 'i').test(s)) return { kind: 'solid', reason: `"${s}" is a mass (a solid), not a liquid`, raw: s }
  // relative: "one volume", "twice the volume of dissociation reagent"
  const rel = s.match(/\b(one|an|a|equal|two|twice|double|three|thrice|half)\s+(?:the\s+)?volumes?\b(?:\s+of\s+(.+))?/i)
    || s.match(/\b(jedn[aą]|równ[aą])\s+objęto/i)
  if (rel) {
    const factor = WORD_NUM[String(rel[1]).toLowerCase()] ?? 1
    const of = rel[2] ? rel[2].trim() : null
    return { kind: 'relative', factor, of, raw: s }
  }
  // per an area: "approximately 2 mL per 10 cm2"
  const area = s.match(new RegExp(`${NUM}\\s*${UNIT}\\s+per\\s+${NUM}\\s*cm(?:2|²)`, 'i'))
  if (area) return { kind: 'per_area', ulPerCm2: toUl(toNum(area[1]), area[2]) / toNum(area[3]), raw: s }
  // a range: "30–50 µl", "1 - 5 µl", "250-1,000 µl", "50-100 µL"
  const range = s.match(new RegExp(`${NUM}\\s*(?:${UNIT})?\\s*(?:[-–—]|to)\\s*${NUM}\\s*${UNIT}`, 'i'))
  if (range) {
    const unit = range[4], lo = toUl(toNum(range[1]), range[2] || unit), hi = toUl(toNum(range[3]), unit)
    return { kind: 'range', ul: (lo + hi) / 2, lo, hi, raw: s }
  }
  // exact (possibly "per sample" / "per 1 ml X" — the stated amount for one basis)
  const ex = s.match(new RegExp(`${NUM}\\s*${UNIT}`, 'i'))
  if (ex) {
    const ul = toUl(toNum(ex[1]), ex[2])
    const per = s.match(new RegExp(`(?:per|na)\\s+(?:${NUM}\\s*${UNIT}\\s*)?(.+)$`, 'i'))
    if (per) return { kind: 'per', ul, basis: per[3].trim(), basisUl: per[1] ? toUl(toNum(per[1]), per[2]) : null, raw: s }
    return { kind: 'exact', ul, approx: /~|approx|około|ok\./i.test(s), raw: s }
  }
  return { kind: 'unknown', reason: `"${s}" states no volume`, raw: s }
}
