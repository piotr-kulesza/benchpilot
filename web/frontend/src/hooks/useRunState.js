import { useCallback, useEffect, useState } from 'react'
import { parseRunState, emptyRunState, runStateKey } from '../lib/runState.js'

// Run-scoped UI state (step, chosen alternatives, counted passes, hazard acks, finished),
// persisted under the RUN ID so a reload resumes the same run and a NEW run (new id) starts
// empty. initialStep only seeds a brand-new run with nothing persisted (a ?step deep link);
// a resumed run keeps its saved step.
export function useRunState(runId, initialStep = 0) {
  const key = runStateKey(runId)
  const [state, setState] = useState(() => {
    let raw = null
    try { raw = localStorage.getItem(key) } catch { /* private mode */ }
    const s = parseRunState(raw)
    if (raw == null && initialStep) s.step = initialStep
    return s
  })

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* private mode */ }
  }, [key, state])

  const setStep = useCallback((v) => setState((s) => ({ ...s, step: typeof v === 'function' ? v(s.step) : v })), [])
  const setAltByStep = useCallback((v) => setState((s) => ({ ...s, altByStep: typeof v === 'function' ? v(s.altByStep) : v })), [])
  const setPassByStep = useCallback((v) => setState((s) => ({ ...s, passByStep: typeof v === 'function' ? v(s.passByStep) : v })), [])
  const setAckedHazards = useCallback((v) => setState((s) => ({ ...s, ackedHazards: typeof v === 'function' ? v(s.ackedHazards) : v })), [])
  const setFinished = useCallback((v) => setState((s) => ({ ...s, finished: typeof v === 'function' ? v(s.finished) : v })), [])
  const reset = useCallback(() => setState(emptyRunState()), [])

  return { ...state, setStep, setAltByStep, setPassByStep, setAckedHazards, setFinished, reset }
}
