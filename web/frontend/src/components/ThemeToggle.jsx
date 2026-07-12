// A small persistent control for flipping light/dark live — so the two can be compared
// without a reload. Fixed bottom-right, out of the way of the runner header controls.
export default function ThemeToggle({ theme, onToggle }) {
  const light = theme === 'light'
  return (
    <button
      type="button" className="theme-toggle" onClick={onToggle}
      title={light ? 'Switch to dark theme' : 'Switch to light theme'}
      aria-label="Toggle colour theme"
    >
      {light ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
