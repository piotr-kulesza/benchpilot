// liquidFrames.js — THE LIQUID INVARIANT, frame by frame, on the live runner.
//
// A vessel's volume may change ONLY during a physical transfer:
//   aspiration — the pipette's tip is in that vessel, below its liquid surface, and the tip's
//                contents change by the opposite amount (the plunger moves);
//   dispensing — the tip is inside the target vessel and the tip's contents fall by what it gains;
//   a spin     — the vessel rides a turning rotor (the column's liquid goes into its collection tube);
//   a pour     — a stream that actually connects the two vessels is showing.
// A colour may change ONLY while liquid flows INTO that vessel; the tip holds its source's colour.
// The sum of every vessel and the tip is conserved in every frame. A station starts as the last
// one ended.
//
// sampleLiquids(line) reads what is DRAWN (each liquid read back through its drawn shape —
// builders' drawnUl / drawnColor) plus where the tip is; checkFrames(frames) is pure.
import { Vector3 } from 'three'
import { animationTempo } from '../scene/tempo.js'

const _t = new Vector3(), _l = new Vector3()
// is the world point inside a vessel's cavity (its local cylinder r, y0..y1)? and below its surface?
function tipIn(obj, cav, surfaceY, tipW) {
  if (!obj || !cav) return { inside: false, below: false }
  obj.updateWorldMatrix(true, false)
  _l.copy(tipW); obj.worldToLocal(_l)
  // a round cavity (r, y0..y1) — or a vessel that is its own box (a flask, a dish, a plate)
  const inside = cav.box ? (_l.x >= cav.box.min.x - 1e-3 && _l.x <= cav.box.max.x + 1e-3 && _l.z >= cav.box.min.z - 1e-3 && _l.z <= cav.box.max.z + 1e-3 && _l.y >= cav.box.min.y - 1e-3 && _l.y <= cav.box.max.y + 0.02)
    : Math.hypot(_l.x, _l.z) <= cav.r + 1e-3 && _l.y >= cav.y0 - 1e-3 && _l.y <= cav.y1 + 0.02
  return { inside, below: inside && surfaceY != null && _l.y <= surfaceY + 0.005 }
}

export function sampleLiquids(line) {
  const S = line.sample(), st = line.stations()[line.active()]
  const pip = st && st.pip
  const tipW = pip ? pip.localToWorld(_t.set(0, 0, 0)).clone() : null
  const cen = st && st.cen
  const turning = !!(cen && cen.userData.st && cen.userData.st.spin > 0.01)
  const out = { vessels: {}, tip: null, streams: (st && st.liquidStreams ? st.liquidStreams.filter((x) => x.mesh.visible).map((x) => [x.from, x.to]) : []) }
  const put = (id, obj, ul, color, cav, surf, docked) => {
    const t = tipW ? tipIn(obj, cav, surf, tipW) : { inside: false, below: false }
    out.vessels[id] = { ul, color, tipIn: t.inside, tipBelow: t.below, spinning: !!(docked && turning) }
  }
  // docked in the rotor — or riding in a vessel that is (the column, not drawn, in the eluate tube)
  const docked = (v) => { for (let n = v; n; n = n.parent) if (n.userData && n.userData.docked) return true; return !!(v && v.userData.ridesWith && docked(v.userData.ridesWith)) }
  if (S) {
    // every vessel of the sample with a drawn volume (a tube, the column, the eluate tube, a flask,
    // a plate, a dish, a cryovial …), by its key — a pour's stream names the same key
    for (const k of Object.keys(S).filter((key) => key !== 'active' && S.vessels.includes(S[key]))) {
      const v = S[k]; if (!v || !v.userData.drawnUl) continue
      put(k, v, v.userData.drawnUl(), v.userData.drawnColor ? v.userData.drawnColor() : null, v.userData.cavity, v.userData.surfaceY ? v.userData.surfaceY() : null, docked(v))
    }
    const c = S.column
    if (c && c.userData.drawnFlowUl) put('flow', c.userData.collGrp, c.userData.drawnFlowUl(), c.userData.drawnFlowColor(), c.userData.flowCavity, c.userData.flowSurfaceY(), docked(c.userData.collGrp))
  }
  // a carried mix by its ledger id ('prep:<id>'), so a boundary can except what the ledger retires
  line.preps().forEach((pv, i) => { if (pv.userData.drawnUl) put(pv.userData.prepId ? 'prep:' + pv.userData.prepId : 'prep' + i, pv, pv.userData.drawnUl(), pv.userData.drawnColor(), pv.userData.cavity, pv.userData.surfaceY(), false) })
  if (st) for (const [k, r] of Object.entries(st.reagents || {})) {
    const b = r && r.grp; if (!b || !b.userData.drawnUl) continue
    put('source ' + k, b, b.userData.drawnUl(), b.userData.drawnColor ? b.userData.drawnColor() : null, b.userData.cavity, b.userData.surfaceY ? b.userData.surfaceY() : null, false)
  }
  if (st && st.waste && st.waste.userData.wasteUl != null) put('waste', st.waste, st.waste.userData.wasteUl, null, st.waste.userData.cavity, null, false)
  // every pipette of the station (a P200 and a P1000): the tip is what they hold together, coloured
  // by the one holding liquid
  const pips = st && st.pips ? Object.values(st.pips) : pip ? [pip] : []
  if (pips.some((x) => x.userData.drawnUl)) {
    const held = pips.filter((x) => x.userData.drawnUl).map((x) => ({ ul: x.userData.drawnUl(), color: x.userData.drawnColor() }))
    const full = held.find((h) => h.ul > 0) || (pip && pip.userData.drawnUl ? { color: pip.userData.drawnColor() } : held[0])
    out.tip = { ul: held.reduce((a, h) => a + h.ul, 0), color: full.color }
  }
  return out
}

const EPS = 0.05          // µl: below this a volume did not change
const SUM_TOL = 0.5       // µl: the sum of every vessel and the tip, frame to frame

// frames: [{ k, p, ...sampleLiquids }]. Returns violations { check: a|b|c, frame, vessel, detail }.
export function checkFrames(frames) {
  const bad = []
  for (let i = 1; i < frames.length; i++) {
    const A = frames[i - 1], B = frames[i]
    const dTip = (B.tip ? B.tip.ul : 0) - (A.tip ? A.tip.ul : 0)
    const flows = new Set(B.streams.concat(A.streams).flat())
    const ids = Object.keys(B.vessels).filter((id) => A.vessels[id])
    const dv = Object.fromEntries(ids.map((id) => [id, B.vessels[id].ul - A.vessels[id].ul]))
    for (const id of ids) {
      const a = A.vessels[id], b = B.vessels[id], d = dv[id]
      if (Math.abs(d) > EPS) {
        const tipHere = (a.tipIn || b.tipIn) && Math.abs(dTip) > 1e-6 && Math.sign(dTip) === -Math.sign(d)
        const aspirating = d < 0 && tipHere && a.tipBelow
        const dispensing = d > 0 && tipHere
        const spun = a.spinning || b.spinning
        const poured = flows.has(id)
        if (!(aspirating || dispensing || spun || poured)) {
          bad.push({ check: 'a', frame: B.k, p: B.p, vessel: id, detail: `${d > 0 ? '+' : ''}${d.toFixed(2)} µl with no transfer` +
            (d < 0 && tipHere && !a.tipBelow ? ' (the tip is above the liquid)' : (a.tipIn || b.tipIn) && Math.abs(dTip) <= 1e-6 ? ' (the tip is in it but holds still)' : '') })
        }
      }
      // colour: only while something flows IN
      // (any inflow at all counts: at the tail of a dispense curve a sub-1e-6 µl step can still tip a colour channel's rounding)
      if (a.color && b.color && a.color !== b.color && !(d > 1e-12) && b.ul > EPS) bad.push({ check: 'b', frame: B.k, p: B.p, vessel: id, detail: `${a.color} → ${b.color} with nothing flowing in` })
    }
    // the tip draws its source's colour
    if (dTip > EPS && B.tip) {
      const src = ids.find((id) => dv[id] < -EPS)
      if (src && B.vessels[src].color && B.tip.color !== B.vessels[src].color) bad.push({ check: 'b', frame: B.k, p: B.p, vessel: 'tip', detail: `tip ${B.tip.color} drawing from ${src} ${B.vessels[src].color}` })
    }
    if (A.tip && B.tip && A.tip.color !== B.tip.color && B.tip.ul > EPS && !(dTip > EPS)) bad.push({ check: 'b', frame: B.k, p: B.p, vessel: 'tip', detail: `${A.tip.color} → ${B.tip.color} with nothing drawn` })
    // conservation
    const sum = (F) => ids.reduce((s, id) => s + F.vessels[id].ul, 0) + (F.tip ? F.tip.ul : 0)
    const dSum = sum(B) - sum(A)
    if (Math.abs(dSum) > SUM_TOL) bad.push({ check: 'c', frame: B.k, p: B.p, vessel: 'Σ', detail: `vessels + tip ${dSum > 0 ? '+' : ''}${dSum.toFixed(2)} µl in one frame` })
  }
  return bad
}

// the station boundary: the start of station n+1 against the end of station n (same objects).
// `except`: vessel ids replaced at the boundary (a retired collection tube).
export function checkBoundary(end, start, except = []) {
  const bad = []
  for (const id of Object.keys(end.vessels)) {
    if (!start.vessels[id] || except.includes(id) || id.startsWith('source') || id === 'waste') continue
    const a = end.vessels[id], b = start.vessels[id]
    if (Math.abs(a.ul - b.ul) > EPS) bad.push({ check: 'd', frame: 0, vessel: id, detail: `${a.ul.toFixed(1)} → ${b.ul.toFixed(1)} µl across the boundary` })
    else if (a.ul > EPS && a.color !== b.color) bad.push({ check: 'd', frame: 0, vessel: id, detail: `${a.color} → ${b.color} across the boundary` })
  }
  return bad
}

// Run the ACTIVE station frame by frame (as collisionDriver.simulateStation does: a timed step's
// rest first, then p driven over the station's own duration, waiting for vessels to arrive, then a
// tail) and sample every frame. Returns { frames, bad }.
export function runStation(line, { hold = 0, tail = 1.5, keep = 3, stopAt = null } = {}) {
  // wall time: the scene's motion runs animationTempo()× slower than dt
  const fps = 60, st = line.stations()[line.active()], dur = ((st && st.duration) || 6.5) * animationTempo()
  const S = line.sample()
  const arriving = () => !!((S && S.vessels.some((v) => v.visible && v.userData.trip)) || line.preps().some((v) => v.visible && v.userData.trip))
  const H = Math.round(hold * animationTempo() * fps), total = H + Math.round((dur + tail * animationTempo()) * fps)
  const frames = []
  let run = 0
  line.hold = true
  try {
    for (let k = 0; k <= total; k++) {
      if (k >= H && !arriving()) run++
      line.pForce = k < H ? null : Math.min(1, run / (dur * fps))
      line.step(1 / fps)
      frames.push({ k, p: +(line.pForce || 0).toFixed(4), ...sampleLiquids(line) })
      if (stopAt != null && k >= stopAt) return { dur, frame: frames[frames.length - 1] }
    }
  } finally { line.pForce = null }
  const bad = checkFrames(frames)
  // keep the frames around each violation (for the evidence sheet)
  const want = new Set(); for (const b of bad) for (let j = -keep; j <= 0; j++) want.add(b.frame + j)
  return { dur, frames: frames.filter((f) => want.has(f.k)), nFrames: frames.length, bad }
}
