import { useCallback, useEffect, useState } from 'react'
import { appendEvent } from '../lib/runLog.js'
import { runLogKey } from '../lib/runState.js'

// The run log, persisted to localStorage so it survives a reload (someone closes the laptop
// mid-incubation; the log must still be there). Keyed by the RUN ID (not the protocol), so a
// reload resumes the same log while a NEW run starts empty. Stamps `at` and stores; all logic
// lives in the pure runLog.js.
export function useRunLog(runId = 'default') {
  const key = runLogKey(runId)
  const [events, setEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
  })

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(events)) } catch { /* private mode — keep in memory */ }
  }, [key, events])

  const append = useCallback((event) => setEvents((l) => appendEvent(l, event)), [])
  // stamp the wall-clock here (kept out of the pure lib so that stays testable)
  const emit = useCallback((type, payload = {}) => append({ type, at: Date.now(), ...payload }), [append])
  const clear = useCallback(() => setEvents([]), [])

  return { events, append, emit, clear }
}
