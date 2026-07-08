import { formatDuration } from '../lib/runtime.js'

// Presentational timer control strip. The countdown STATE lives one level up (in
// StepCard) so the same clock drives both this control and the action animation's
// ring/rotor. This just shows the digits, spin params, and start/pause/reset.
export default function TimerControls({ remaining, running, done, start, pause, reset, spin }) {
  const paramBits = []
  if (spin?.rcf_min) paramBits.push(`≥ ${spin.rcf_min.toLocaleString()} ×g`)
  if (spin?.note) paramBits.push(spin.note)

  return (
    <div className={`timer-bar${done ? ' done' : ''}`}>
      <div className="timer-readout">
        <span className="timer-digits">{formatDuration(remaining)}</span>
        {done ? (
          <span className="timer-flag">✓ Time&apos;s up</span>
        ) : (
          <span className="timer-state">{running ? 'counting down' : 'ready'}</span>
        )}
      </div>
      {paramBits.length > 0 && <div className="timer-params">🌀 {paramBits.join(' · ')}</div>}
      <div className="timer-controls">
        {!running && !done && (
          <button className="go" onClick={start}>▶ Start</button>
        )}
        {running && <button onClick={pause}>⏸ Pause</button>}
        {(done || !running) && <button onClick={reset}>↺ Reset</button>}
      </div>
    </div>
  )
}
