// pipetteSpeed.js — pure analysis of a recorded pipette trajectory (scripts/pipette-speed.mjs).
//
// rec: one row per frame: [frame, activeStation, p, dt, ...[station, x, y, z, phase, vis]] — every
// pipette that could be seen that frame, in world space. Per pipette:
//   descent  the peak speed of its DESCENT into the vessel while its station is active (the
//            reference: that speed reads right)
//   fast     frames faster than tol × descent, grouped into segments (phase, peak, how long)
//   jumps    an isolated one-frame jump (≥ `jump` units, ≥ 4× the frames on either side), or a
//            pipette that was hidden and reappears somewhere else
const BEFORE = new Set(['to source', 'into source', 'draw', 'out of source', 'travel'])
const AFTER = new Set(['lift', 'return'])
export function analyse(rec, { tol = 1.1, jump = 0.05, names = [] } = {}) {
  const tracks = new Map()
  for (const row of rec) {
    const [frame, active, p, dt] = row
    for (const c of row.slice(4)) {
      const [i, x, y, z, phase, vis] = c
      if (!tracks.has(i)) tracks.set(i, [])
      tracks.get(i).push({ frame, active, p, dt, x, y, z, phase, vis })
    }
  }
  const out = { stations: [], fast: [], teleports: [], maxRatio: 0 }
  const refs = []
  for (const [i, T] of tracks) {
    // per frame: distance from the previous frame (only between CONSECUTIVE frames)
    for (let k = 0; k < T.length; k++) {
      const a = T[k - 1], b = T[k]
      b.d = a && b.frame === a.frame + 1 ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : null
      b.v = b.d != null && b.dt > 0 ? b.d / b.dt : null
      b.gap = a && b.frame !== a.frame + 1 ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : null
    }
    let ref = null
    for (const f of T) if (f.phase === 'descent' && f.active === i && f.v != null) ref = Math.max(ref || 0, f.v)
    if (ref) refs.push(ref)
    T.ref = ref
  }
  const fallback = refs.length ? Math.min(...refs) : null
  for (const [i, T] of [...tracks].sort((a, b) => a[0] - b[0])) {
    const ref = T.ref || fallback
    let max = 0, maxPhase = '', seg = null
    const close = () => { if (seg) { out.fast.push(seg); seg = null } }
    for (let k = 0; k < T.length; k++) {
      const f = T[k]
      // jumps: hidden and back somewhere else; or one isolated frame
      if (f.gap != null && f.gap > 0.02) out.teleports.push({ station: i + 1, frame: f.frame, kind: 'reappears elsewhere', phase: f.phase, dist: f.gap })
      if (f.d != null && f.d >= jump) {
        const n0 = T[k - 1] && T[k - 1].d != null ? T[k - 1].d : 0, n1 = T[k + 1] && T[k + 1].d != null ? T[k + 1].d : 0
        if (f.d >= 4 * Math.max(n0, n1)) out.teleports.push({ station: i + 1, frame: f.frame, kind: f.active === i ? 'jump' : 'jump (not active)', phase: f.phase, dist: f.d })
      }
      if (f.v == null || !ref) { close(); continue }
      if (f.v > max) { max = f.v; maxPhase = f.phase }
      out.maxRatio = Math.max(out.maxRatio, f.v / ref)
      if (f.v > tol * ref) {
        const where = f.active !== i ? 'between stations' : BEFORE.has(f.phase) ? 'before descent' : AFTER.has(f.phase) ? 'after lift' : f.phase
        if (!seg || seg.where !== where || f.frame !== seg.last + 1) { close(); seg = { station: i + 1, where, phases: [], frame: f.frame, last: f.frame, frames: 0, peak: 0, ref } }
        seg.last = f.frame; seg.frames++; seg.seconds = seg.frames / 60
        if (!seg.phases.includes(f.phase)) seg.phases.push(f.phase)
        if (f.v > seg.peak) { seg.peak = f.v; seg.ratio = f.v / ref }
      } else close()
    }
    close()
    out.stations.push({ station: i + 1, action: names[i] || '', descent: T.ref, max, maxPhase, ratio: ref ? max / ref : null })
  }
  return out
}
