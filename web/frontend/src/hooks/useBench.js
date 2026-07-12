import { useCallback, useEffect, useState } from 'react'

// Which SCENE preset the 3D bench uses — independent of the UI theme, so all four
// theme×bench combinations can be compared. Resolve order: ?bench= URL param → persisted →
// dark (the current default). The choice persists; ?bench=light sticks after the param.
const KEY = 'benchpilot.bench'

function initialBench() {
  try {
    const u = new URLSearchParams(window.location.search).get('bench')
    if (u === 'light' || u === 'dark') return u
    const s = localStorage.getItem(KEY)
    if (s === 'light' || s === 'dark') return s
  } catch { /* ignore */ }
  return 'dark'
}

export function useBench() {
  const [bench, setBench] = useState(initialBench)
  useEffect(() => { try { localStorage.setItem(KEY, bench) } catch { /* private mode */ } }, [bench])
  const toggle = useCallback(() => setBench((b) => (b === 'light' ? 'dark' : 'light')), [])
  return { bench, toggle }
}
