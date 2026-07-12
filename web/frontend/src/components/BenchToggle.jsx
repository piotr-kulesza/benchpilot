// Flip the 3D SCENE preset (light/dark bench) live — separate from the UI theme toggle,
// so the two axes can be judged independently. Sits just left of the theme toggle.
export default function BenchToggle({ bench, onToggle }) {
  const dark = bench === 'dark'
  return (
    <button
      type="button" className="bench-toggle" onClick={onToggle}
      title={dark ? 'Bench: dark — switch to light' : 'Bench: light — switch to dark'}
      aria-label="Toggle 3D bench preset"
    >
      {/* a little bench slab — filled = dark bench, hollow = light bench */}
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="9" width="18" height="7" rx="1.5"
          fill={dark ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />
        <path d="M6 16v3M18 16v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}
