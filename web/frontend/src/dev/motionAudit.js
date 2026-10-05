// motionAudit.js — NOTHING TELEPORTS; STARTS AND STOPS ARE EASED. Pure functions over
// per-frame tracks (no DOM). A track is the per-frame pose of one moving thing (an object's
// root in the world, or a part — a lid, a door, an arm — relative to its object):
//   [{ pos: [x,y,z], quat: [x,y,z,w], visible }]   one entry per frame, fixed dt
// Findings:
//   teleport — a single-frame jump with no motion around it (it changed place without
//              travelling), or a pop: it appears / vanishes mid-step while the step runs
//   abrupt-start / abrupt-stop — a move whose first (last) frame already runs at more than
//              EASE.ratio of the move's peak speed: it starts (stops) at speed — linear, or an
//              exponential chase — instead of accelerating (settling)
export const EASE = {
  still: 2e-4,      // world units (or radians) per frame below which a thing is at rest
  ratio: 0.3,       // first/last-frame speed over peak speed above which a start/stop is abrupt
  jump: 0.06,       // a single-frame displacement this large with rest around it = teleport
  minFrames: 4,     // shorter moves are jitter, not moves
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const angle = (q, r) => {
  const [x1, y1, z1, w1] = q, [x2, y2, z2, w2] = r
  const w = w1 * w2 + x1 * x2 + y1 * y2 + z1 * z2
  const x = w1 * x2 - x1 * w2 - y1 * z2 + z1 * y2, y = w1 * y2 - y1 * w2 - z1 * x2 + x1 * z2, z = w1 * z2 - z1 * w2 - x1 * y2 + y1 * x2
  return 2 * Math.atan2(Math.hypot(x, y, z), Math.abs(w))
}

// per-frame speeds of a track (translation and rotation, separately)
export function speeds(track) {
  const lin = [0], rot = [0]
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i]
    const ok = a.visible && b.visible
    lin.push(ok ? dist(a.pos, b.pos) : 0)
    rot.push(ok ? angle(a.quat, b.quat) : 0)
  }
  return { lin, rot }
}

// maximal runs of frames moving faster than `still`
export function moves(sp, still = EASE.still) {
  const out = []
  let s = -1
  for (let i = 0; i <= sp.length; i++) {
    const m = i < sp.length && sp[i] > still
    if (m && s < 0) s = i
    if (!m && s >= 0) { out.push([s, i - 1]); s = -1 }
  }
  return out
}

export function auditTrack(track, { kind = 'object', from = 0, to = track.length - 1 } = {}) {
  const findings = []
  const { lin, rot } = speeds(track)
  // pops: visibility flips inside the step window
  for (let i = Math.max(1, from); i <= to; i++) {
    if (track[i].visible !== track[i - 1].visible) findings.push({ check: 'teleport', how: track[i].visible ? 'appears' : 'vanishes', frame: i })
  }
  for (const [sp, unit] of [[lin, 'move'], [rot, 'turn']]) {
    for (const [a, b] of moves(sp)) {
      const n = b - a + 1
      const peak = Math.max(...sp.slice(a, b + 1))
      if (unit === 'move' && n <= 2 && peak > EASE.jump) { findings.push({ check: 'teleport', how: `jumps ${peak.toFixed(3)} in ${n} frame${n > 1 ? 's' : ''}`, frame: a }); continue }
      if (n < EASE.minFrames) continue
      // a move that runs into the end of the window was cut, not stopped; one that starts at
      // the window's first frame was already moving
      if (a > from + 1 && sp[a] > EASE.ratio * peak) findings.push({ check: 'abrupt-start', how: `${unit} starts at ${(100 * sp[a] / peak).toFixed(0)}% of peak`, frame: a, peak })
      if (b < to && sp[b] > EASE.ratio * peak) findings.push({ check: 'abrupt-stop', how: `${unit} stops from ${(100 * sp[b] / peak).toFixed(0)}% of peak`, frame: b, peak })
    }
  }
  return findings.map((f) => ({ ...f, kind }))
}
