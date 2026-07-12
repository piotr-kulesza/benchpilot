// The run log — pure data. An append-only list of timestamped events describing what
// ACTUALLY happened on one run, plus reducers over it (deviations, a view model) and the
// export formatters (Markdown + JSON). No DOM, no timers, no Date.now(): the caller stamps
// each event's `at`, so this whole module unit-tests offline with canned clock values.

export const EVENTS = {
  RUN_STARTED: 'run_started',
  INTAKE_ANSWER: 'intake_answer',
  STEP_ENTERED: 'step_entered',
  STEP_LEFT: 'step_left',
  TIMER_STARTED: 'timer_started',
  TIMER_PAUSED: 'timer_paused',
  TIMER_RESUMED: 'timer_resumed',
  TIMER_RESET: 'timer_reset',
  TIMER_COMPLETED: 'timer_completed',
  ALTERNATIVE_CHOSEN: 'alternative_chosen',
  PASS_COUNTED: 'pass_counted',
  HAZARD_ACK: 'hazard_ack',
  NOTE: 'note',
  RUN_COMPLETED: 'run_completed',
  RUN_ABANDONED: 'run_abandoned',
}

// The one reducer: append. (Kept as a named function so the seam is a single, obvious
// choke point and so a future normalisation has one home.)
export function appendEvent(log, event) {
  return [...log, event]
}

// ── formatting helpers ───────────────────────────────────────────────────────
export function formatClock(at) {
  if (!at) return '—'
  const d = new Date(at)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function formatDate(at) {
  if (!at) return '—'
  const d = new Date(at)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// "45 s", "15 min", "19 min 3 s" — honest and compact.
export function formatElapsed(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem ? `${m} min ${rem} s` : `${m} min`
}

// ── timer pairing: the ACTUAL wall-clock a timer ran, vs its nominal duration ──
// Pair each timer_completed with the most recent timer_started on the same step; the
// wall elapsed (which includes any pauses) is what makes "ran 19 min, nominal 15" visible.
function pairTimers(events) {
  const startedByStep = new Map()
  const byIndex = new Map()
  events.forEach((e, i) => {
    if (e.type === EVENTS.TIMER_STARTED) startedByStep.set(e.step, { at: e.at, nominal: e.nominal })
    if (e.type === EVENTS.TIMER_COMPLETED) {
      const s = startedByStep.get(e.step)
      const nominal = e.nominal ?? s?.nominal ?? 0
      const wall = s ? (e.at - s.at) / 1000 : nominal
      byIndex.set(i, { wall, nominal })
    }
  })
  return byIndex
}

// A timer materially over its nominal (from pauses / distraction) is the deviation worth
// knowing about. Thresholds are deliberately loose so we never cry wolf on a few seconds.
const LONG_TIMER_FACTOR = 1.15
const LONG_TIMER_MIN_EXTRA = 30 // seconds

export function computeDeviations(events) {
  const out = []
  const timers = pairTimers(events)

  // forward jumps that leave a gap = skipped steps
  let lastEntered = null
  for (const e of events) {
    if (e.type !== EVENTS.STEP_ENTERED) continue
    if (lastEntered != null && e.step > lastEntered + 1) {
      const skipped = []
      for (let s = lastEntered + 1; s < e.step; s++) skipped.push(s)
      out.push({ kind: 'skipped', step: e.step, skipped, message: `Step${skipped.length > 1 ? 's' : ''} ${skipped.join(', ')} skipped (jumped ${lastEntered} → ${e.step})` })
    }
    lastEntered = e.step
  }

  // timers that ran materially longer than nominal
  events.forEach((e, i) => {
    if (e.type !== EVENTS.TIMER_COMPLETED) return
    const t = timers.get(i)
    if (!t || !t.nominal) return
    if (t.wall > t.nominal * LONG_TIMER_FACTOR && t.wall - t.nominal >= LONG_TIMER_MIN_EXTRA) {
      out.push({ kind: 'long_timer', step: e.step, wall: t.wall, nominal: t.nominal,
        message: `Timer on step ${e.step} ran ${formatElapsed(t.wall)} (nominal ${formatElapsed(t.nominal)})` })
    }
  })

  // acknowledged hazards are worth surfacing in the record
  for (const e of events) {
    if (e.type === EVENTS.HAZARD_ACK) {
      out.push({ kind: 'hazard', step: e.step, message: `Hazard acknowledged on step ${e.step}: ${e.text || ''}`.trim() })
    }
  }

  return out
}

// ── a human sentence per event (shared by the on-screen timeline + the Markdown) ──
export function describeEvent(e, timers) {
  switch (e.type) {
    case EVENTS.RUN_STARTED: return `Run started — ${e.name || 'protocol'}`
    case EVENTS.INTAKE_ANSWER: return `Answered ${e.label || e.key}: ${e.valueLabel || e.value}`
    case EVENTS.STEP_ENTERED: return `Entered${e.stepTitle ? ` — ${e.stepTitle}` : ''}`
    case EVENTS.STEP_LEFT: return `Left${e.stepTitle ? ` — ${e.stepTitle}` : ''}`
    case EVENTS.TIMER_STARTED: return `Timer started (${formatElapsed(e.nominal)})`
    case EVENTS.TIMER_PAUSED: return `Timer paused${e.elapsed != null ? ` at ${formatElapsed(e.elapsed)}` : ''}`
    case EVENTS.TIMER_RESUMED: return 'Timer resumed'
    case EVENTS.TIMER_RESET: return 'Timer reset'
    case EVENTS.TIMER_COMPLETED: {
      const t = timers?.get?.(e._i)
      if (t && t.nominal) return `Timer completed — ran ${formatElapsed(t.wall)} (nominal ${formatElapsed(t.nominal)})`
      return 'Timer completed'
    }
    case EVENTS.ALTERNATIVE_CHOSEN: return `Chose: ${e.label ?? `option ${e.index}`}`
    case EVENTS.PASS_COUNTED: return `Counted pass ${e.pass ?? ''}`.trim()
    case EVENTS.HAZARD_ACK: return `Hazard acknowledged: ${e.text || ''}`.trim()
    case EVENTS.NOTE: return e.text || ''
    case EVENTS.RUN_COMPLETED: return 'Run completed'
    case EVENTS.RUN_ABANDONED: return 'Run left unfinished'
    default: return e.type
  }
}

// Ready-to-render chronological rows for the on-screen record — notes flagged distinct,
// timer-completed rows enriched with the real elapsed. Keeps the component free of logic.
export function timelineRows(events) {
  const timers = pairTimers(events)
  return events.map((e, i) => ({
    at: e.at,
    step: e.step ?? null,
    kind: e.type === EVENTS.NOTE ? 'note'
      : e.type === EVENTS.HAZARD_ACK ? 'hazard'
        : (e.type === EVENTS.RUN_STARTED || e.type === EVENTS.RUN_COMPLETED || e.type === EVENTS.RUN_ABANDONED) ? 'run'
          : 'system',
    text: describeEvent({ ...e, _i: i }, timers),
  }))
}

// ── the view model: what the record screen renders and what the Markdown formats ──
export function summarize(events, meta = {}) {
  const first = events[0]
  const last = events[events.length - 1]
  const done = events.find((e) => e.type === EVENTS.RUN_COMPLETED)
  return {
    protocol: meta.protocol || events.find((e) => e.type === EVENTS.RUN_STARTED)?.name || 'Protocol',
    operator: meta.operator || '',
    startedAt: first?.at || null,
    endedAt: last?.at || null,
    status: done ? 'completed' : events.some((e) => e.type === EVENTS.RUN_ABANDONED) ? 'left unfinished' : 'in progress',
    intake: events.filter((e) => e.type === EVENTS.INTAKE_ANSWER),
    notes: events.filter((e) => e.type === EVENTS.NOTE),
    deviations: computeDeviations(events),
    events,
  }
}

// ── exports ───────────────────────────────────────────────────────────────────
export function toMarkdown(events, meta = {}) {
  const s = summarize(events, meta)
  const timers = pairTimers(events)
  const L = []
  L.push(`# Run record — ${s.protocol}`)
  L.push('')
  L.push('*A record of one run — not a certified audit trail.*')
  L.push('')
  L.push(`- **Protocol:** ${s.protocol}`)
  L.push(`- **Date:** ${formatDate(s.startedAt)}`)
  L.push(`- **Started:** ${formatClock(s.startedAt)} · **Ended:** ${formatClock(s.endedAt)} (${s.status})`)
  L.push(`- **Operator:** ${s.operator || '—'}`)
  L.push('')

  L.push('## Parameters')
  if (s.intake.length) {
    for (const e of s.intake) L.push(`- ${e.label || e.key}: **${e.valueLabel || e.value}**`)
  } else {
    L.push('- None recorded.')
  }
  L.push('')

  L.push('## Deviations')
  if (s.deviations.length) {
    for (const d of s.deviations) L.push(`- ⚠️ ${d.message}`)
  } else {
    L.push('- None flagged.')
  }
  L.push('')

  L.push('## Timeline')
  L.push('')
  L.push('| Time | Step | Event |')
  L.push('| --- | --- | --- |')
  events.forEach((e, i) => {
    const desc = describeEvent({ ...e, _i: i }, timers).replace(/\|/g, '\\|')
    L.push(`| ${formatClock(e.at)} | ${e.step ?? ''} | ${desc} |`)
  })
  L.push('')

  L.push('## Notes')
  if (s.notes.length) {
    for (const n of s.notes) L.push(`- **${formatClock(n.at)} · step ${n.step ?? '—'}** — ${n.text}`)
  } else {
    L.push('- No notes recorded.')
  }
  L.push('')
  return L.join('\n')
}

export function toJSON(events, meta = {}) {
  const s = summarize(events, meta)
  return JSON.stringify({
    kind: 'benchpilot.run-record',
    disclaimer: 'A record of one run, not a certified audit trail.',
    protocol: s.protocol,
    operator: s.operator || null,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    status: s.status,
    parameters: s.intake.map((e) => ({ key: e.key, value: e.value, label: e.label ?? e.key, valueLabel: e.valueLabel ?? e.value })),
    deviations: s.deviations,
    events,
  }, null, 2)
}
