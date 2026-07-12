import { Button } from '../ui/primitives.jsx'

// Instrument-style timer readout. The countdown STATE lives one level up (in
// StepCard) so the same clock drives this control AND the scene's ring/rotor.
// Minutes are zero-padded ('09:59' → '10:00') so — with tabular figures — the
// readout never changes width or shifts as it ticks.
function fmt(sec) {
  if (sec == null || isNaN(sec) || sec < 0) return '0:00'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  const p = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`
}

export default function TimerControls({ remaining, running, done, start, pause, reset, spin }) {
  const params = []
  if (spin?.rcf_min) params.push(`≥ ${spin.rcf_min.toLocaleString()} ×g`)
  if (spin?.note) params.push(spin.note)

  return (
    <div className={`timer${done ? ' done' : ''}`}>
      <div className="timer-top">
        <span className="timer-digits">{fmt(remaining)}</span>
        <span className="timer-state">{done ? "✓ Time's up" : running ? 'counting down' : 'ready'}</span>
      </div>
      {params.length > 0 && <div className="timer-params num">🌀 {params.join(' · ')}</div>}
      <div className="timer-controls">
        {!running && !done && <Button variant="primary" size="sm" onClick={start}>▶ Start</Button>}
        {running && <Button variant="secondary" size="sm" onClick={pause}>⏸ Pause</Button>}
        {(done || !running) && <Button variant="ghost" size="sm" onClick={reset}>↺ Reset</Button>}
      </div>
    </div>
  )
}
