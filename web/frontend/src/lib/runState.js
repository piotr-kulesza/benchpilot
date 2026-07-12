// One run identity. Every piece of run-scoped state hangs off a run id, and starting a
// protocol mints a NEW id with EMPTY state — so a new run can never inherit the previous
// one's step, answers, passes, timer, acks or log. Pure + storage-agnostic so it unit-tests
// offline; the React glue (useRunState) and App own the actual localStorage/session.

// the fresh, empty run-scoped state a new run begins with
export const EMPTY_RUN_STATE = { step: 0, altByStep: {}, passByStep: {}, ackedHazards: {}, finished: false }

export function emptyRunState() {
  return { step: 0, altByStep: {}, passByStep: {}, ackedHazards: {}, finished: false }
}

// per-run storage keys — everything run-scoped is namespaced by the run id, so a sweep can
// find and drop anything that isn't the current run.
export const RUN_STATE_PREFIX = 'benchpilot.run.'
export const RUN_LOG_PREFIX = 'benchpilot.runlog.'
export function runStateKey(runId) { return RUN_STATE_PREFIX + runId }
export function runLogKey(runId) { return RUN_LOG_PREFIX + runId }

// mint a unique run id. The clock+random source is injected so this stays pure/testable;
// App passes Date.now()/Math.random(). Two calls with distinct sources never collide.
export function makeRunId(nowMs, rand) {
  const a = Number(nowMs || 0).toString(36)
  const b = Math.floor((rand || 0) * 1e9).toString(36)
  return `r${a}${b}`
}

// parse persisted run state, tolerating missing/garbage — always returns a complete state
// (a partial blob is merged onto the empty defaults, so an old shape can't leak `undefined`).
export function parseRunState(raw) {
  if (raw == null) return emptyRunState()
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return emptyRunState()
    return {
      ...emptyRunState(),
      ...o,
      altByStep: o.altByStep && typeof o.altByStep === 'object' ? o.altByStep : {},
      passByStep: o.passByStep && typeof o.passByStep === 'object' ? o.passByStep : {},
      ackedHazards: o.ackedHazards && typeof o.ackedHazards === 'object' ? o.ackedHazards : {},
    }
  } catch { return emptyRunState() }
}

// every run-scoped key that is NOT the current run — the sweep removes these so orphaned
// runs (old protocol-keyed logs, finished runs) never pile up or bleed back in.
export function orphanRunKeys(allKeys, currentRunId) {
  const mine = new Set([runStateKey(currentRunId), runLogKey(currentRunId)])
  return (allKeys || []).filter((k) =>
    (k.startsWith(RUN_STATE_PREFIX) || k.startsWith(RUN_LOG_PREFIX)) && !mine.has(k))
}
