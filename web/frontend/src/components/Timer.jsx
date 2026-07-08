import { useCountdown } from '../hooks/useCountdown.js'
import { formatDuration } from '../lib/runtime.js'

// A calm countdown dial for wait/spin steps. Shows spin params (rcf, note) and a
// clear visual + audible cue on completion.
export default function Timer({ seconds, spin }) {
  const { remaining, running, done, start, pause, reset } = useCountdown(seconds)

  const R = 56
  const C = 2 * Math.PI * R
  const frac = seconds > 0 ? remaining / seconds : 0
  const offset = C * (1 - frac)

  const paramBits = []
  if (spin?.rcf_min) paramBits.push(`≥ ${spin.rcf_min.toLocaleString()} ×g`)
  if (spin?.note) paramBits.push(spin.note)

  return (
    <div className={`timer-wrap${done ? ' done' : ''}`}>
      <div className={`timer-dial${done ? ' done' : ''}`}>
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle className="ring-bg" cx="64" cy="64" r={R} fill="none" strokeWidth="9" />
          <circle
            className="ring-fg"
            cx="64"
            cy="64"
            r={R}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="num">{formatDuration(remaining)}</div>
      </div>

      <div className="timer-side">
        {done ? (
          <div className="timer-done-flag">✓ Time&apos;s up</div>
        ) : (
          <div className="timer-caption">{running ? 'Counting down' : 'Timer'}</div>
        )}
        {paramBits.length > 0 && (
          <div className="timer-params">
            <span className="spin-icon">🌀</span>
            {paramBits.join(' · ')}
          </div>
        )}
        <div className="timer-controls">
          {!running && !done && (
            <button className="go" onClick={start}>
              ▶ Start
            </button>
          )}
          {running && <button onClick={pause}>⏸ Pause</button>}
          {(done || !running) && (
            <button onClick={reset}>↺ Reset</button>
          )}
        </div>
      </div>
    </div>
  )
}
