import { useCallback, useEffect, useState } from 'react'

// The whole chrome is driven by one data-theme attribute on <html>; every colour resolves
// from tokens.css under it. Resolve order: ?theme= URL param → persisted choice → dark
// (the default). The choice persists, so ?theme=light sticks after the param is gone.
const KEY = 'benchpilot.theme'

function initialTheme() {
  try {
    const u = new URLSearchParams(window.location.search).get('theme')
    if (u === 'light' || u === 'dark') return u
    const s = localStorage.getItem(KEY)
    if (s === 'light' || s === 'dark') return s
  } catch { /* ignore */ }
  return 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(KEY, theme) } catch { /* private mode */ }
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), [])
  return { theme, toggle }
}
