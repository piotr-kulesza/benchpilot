import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVoice } from '../hooks/useVoice.js'
import { createSoundboard } from '../lib/sounds.js'
import { resolveCommand, hasWake, stripWake } from '../lib/voiceIntent.js'
import { dispatchIntent } from '../lib/voiceDispatch.js'
import { createArming, isCancel } from '../lib/voiceArming.js'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const CONFIRM_WINDOW_MS = 8000 // how long a "say it again" reset stays armed

// The default production llm for the long tail: a thin relay to the backend, which holds
// the API key and calls a small fast model. No key ever reaches the browser. If the backend
// is absent it throws → resolveCommand degrades to `unknown` and the local fast path keeps
// working with zero backend.
async function relayLLM(system, user) {
  const res = await fetch(`${API_BASE}/api/intent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, user }),
  })
  if (!res.ok) throw new Error(`intent ${res.status}`)
  const data = await res.json()
  return data.text || ''
}

// Voice: another thin interface over the SAME runtime the buttons drive. The wake word ARMS
// the assistant for a few seconds; while armed, any utterance is a command — so you can pause
// and think after "benchpilot". Mic is off until turned on; everything stays operable by hand.
export default function VoiceControl({ controls, context, board: boardProp }) {
  const board = useMemo(() => boardProp || createSoundboard(), [boardProp])
  const [line, setLine] = useState(null) // { heard, message, ok }
  const [armed, setArmed] = useState(false)

  // keep live refs so the recognition callbacks never dispatch into a stale step/timer
  const ctxRef = useRef(context); ctxRef.current = context
  const ctrlRef = useRef(controls); ctrlRef.current = controls
  const pendingResetRef = useRef(0)

  // the armed-window machine: wake → armed (blip on the edge); silence → disarm quietly.
  const arming = useMemo(() => createArming({
    onArm: () => { setArmed(true); board.wake() },      // the blip fires the instant the word lands
    onDisarm: () => { setArmed(false); board.disarm() }, // quiet stand-down, never an error sound
  }), [board])
  useEffect(() => () => arming.destroy(), [arming])

  // interim speech: arm on the wake word (instantly), otherwise just keep the window open
  const onInterim = useCallback((text) => {
    if (hasWake(text)) arming.wake()
    else if (arming.armed) arming.speech()
  }, [arming])

  const onFinal = useCallback(async (transcript) => {
    const addressed = hasWake(transcript)
    if (addressed) arming.wake()                 // ensure armed (idempotent; blips only if new)
    if (!addressed && !arming.armed) return       // not addressed and not armed → ignore, stay private

    const body = addressed ? stripWake(transcript) : String(transcript || '').trim()
    if (!body) return                             // wake word alone → armed, nothing to do

    if (isCancel(body)) { arming.cancel(); setLine({ heard: body, message: 'Stood down', ok: false }); return }

    const intent = await resolveCommand({ command: body, context: ctxRef.current, llm: relayLLM })
    const confirmed = intent.action === 'reset_timer' && (Date.now() - pendingResetRef.current) < CONFIRM_WINDOW_MS
    const res = dispatchIntent(intent, ctrlRef.current, ctxRef.current, { confirmed })
    pendingResetRef.current = res.needsConfirm ? Date.now() : 0

    if (res.cue) board[res.cue]?.()
    setLine({ heard: body, message: res.message, ok: res.ok })
    // stay armed briefly for a follow-up after a real command; on a miss, keep the window open to retry
    if (res.ok) arming.commandHandled()
    else arming.speech()
  }, [arming, board])

  const { supported, listening, error, interim, toggle } = useVoice({ onFinal, onInterim })

  // HAZARD on the step you just landed on (however you got there, while the mic is live)
  const prevStepRef = useRef(context?.stepIndex)
  useEffect(() => {
    const idx = context?.stepIndex
    if (listening && idx !== prevStepRef.current && context?.hasHazard) board.hazard()
    prevStepRef.current = idx
  }, [context?.stepIndex, context?.hasHazard, listening, board])

  // fade the transcript line after a few seconds
  useEffect(() => {
    if (!line) return undefined
    const id = setTimeout(() => setLine(null), 4200)
    return () => clearTimeout(id)
  }, [line])

  const onToggle = () => { board.resume(); toggle() }

  if (!supported) {
    return (
      <button className="mic-btn mic-off" type="button" disabled
        title="Voice needs a Chromium browser (Chrome/Edge)">
        <MicIcon muted /> <span className="mic-label">Voice n/a</span>
      </button>
    )
  }

  const denied = error === 'mic-denied' || error === 'no-mic'
  const label = denied ? 'Mic blocked' : armed ? 'Ready…' : listening ? 'Listening' : 'Voice'
  return (
    <>
      <button
        className={`mic-btn${listening ? ' mic-live' : ''}${armed ? ' mic-armed' : ''}${denied ? ' mic-denied' : ''}`}
        type="button" onClick={onToggle} aria-pressed={listening}
        title={denied ? 'Microphone blocked — allow it in the browser'
          : armed ? 'Armed — say a command' : listening ? 'Listening — click to stop' : 'Enable voice control'}
      >
        <MicIcon muted={!listening} />
        <span className="mic-label">{label}</span>
        {listening && !armed && <span className="mic-pulse" aria-hidden="true" />}
      </button>

      {(listening || line) && (
        <div className={`voice-hud${armed ? ' vh-armed' : ''}${line ? (line.ok ? ' vh-ok' : ' vh-no') : ''}`} role="status" aria-live="polite">
          {line ? (
            <>
              <span className="vh-heard">“{line.heard}”</span>
              <span className="vh-arrow">→</span>
              <span className="vh-msg">{line.message}</span>
            </>
          ) : (
            <span className="vh-idle">{interim || (armed ? 'Ready — say a command…' : 'Say “benchpilot”, then your command')}</span>
          )}
        </div>
      )}
    </>
  )
}

function MicIcon({ muted }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      {muted && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}
