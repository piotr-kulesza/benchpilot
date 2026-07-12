import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVoice } from '../hooks/useVoice.js'
import { createSoundboard } from '../lib/sounds.js'
import { resolveIntent, hasWake } from '../lib/voiceIntent.js'
import { dispatchIntent } from '../lib/voiceDispatch.js'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const CONFIRM_WINDOW_MS = 8000 // how long a "say it again" reset stays armed

// The default production llm for the long tail: a thin relay to the backend, which holds
// the API key and calls a small fast model. No key ever reaches the browser. If the
// backend is absent it throws → resolveIntent degrades the utterance to `unknown` and the
// local fast path (next/start/pause/…) keeps working with zero backend.
async function relayLLM(system, user) {
  const res = await fetch(`${API_BASE}/api/intent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, user }),
  })
  if (!res.ok) throw new Error(`intent ${res.status}`)
  const data = await res.json()
  return data.text || ''
}

// Voice: another thin interface over the SAME runtime the buttons drive. Mic is off until
// the user turns it on; everything stays fully operable by hand.
export default function VoiceControl({ controls, context, board: boardProp }) {
  const board = useMemo(() => boardProp || createSoundboard(), [boardProp])
  const [line, setLine] = useState(null) // { heard, message, ok }

  // keep live refs so the recognition callbacks never dispatch into a stale step/timer
  const ctxRef = useRef(context); ctxRef.current = context
  const ctrlRef = useRef(controls); ctrlRef.current = controls
  const wakeAckedRef = useRef(false)
  const pendingResetRef = useRef(0)

  // blip the WAKE cue the instant the wake word lands — off the interim, before we resolve
  const onInterim = useCallback((text) => {
    if (!wakeAckedRef.current && hasWake(text)) { board.wake(); wakeAckedRef.current = true }
  }, [board])

  const onFinal = useCallback(async (transcript) => {
    if (!hasWake(transcript)) { wakeAckedRef.current = false; return } // not addressed — ignore, stay private
    if (!wakeAckedRef.current) { board.wake(); wakeAckedRef.current = true }

    const intent = await resolveIntent({ transcript, context: ctxRef.current, llm: relayLLM })
    wakeAckedRef.current = false

    const confirmed = intent.action === 'reset_timer' && (Date.now() - pendingResetRef.current) < CONFIRM_WINDOW_MS
    const res = dispatchIntent(intent, ctrlRef.current, ctxRef.current, { confirmed })
    pendingResetRef.current = res.needsConfirm ? Date.now() : 0

    if (res.cue) board[res.cue]?.()
    setLine({ heard: intent.heard, message: res.message, ok: res.ok })
  }, [board])

  const { supported, listening, error, interim, toggle } = useVoice({ onFinal, onInterim })

  // HAZARD on the step you just landed on (however you got there, while the mic is live) —
  // a negative "do NOT…" must not be something you only discover by looking.
  const prevStepRef = useRef(context?.stepIndex)
  useEffect(() => {
    const idx = context?.stepIndex
    if (listening && idx !== prevStepRef.current && context?.hasHazard) board.hazard()
    prevStepRef.current = idx
  }, [context?.stepIndex, context?.hasHazard, listening, board])

  // fade the transcript line after a few seconds so it stays unobtrusive
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
  return (
    <>
      <button
        className={`mic-btn${listening ? ' mic-live' : ''}${denied ? ' mic-denied' : ''}`}
        type="button" onClick={onToggle} aria-pressed={listening}
        title={denied ? 'Microphone blocked — allow it in the browser' : listening ? 'Listening — click to stop' : 'Enable voice control'}
      >
        <MicIcon muted={!listening} />
        <span className="mic-label">{denied ? 'Mic blocked' : listening ? 'Listening' : 'Voice'}</span>
        {listening && <span className="mic-pulse" aria-hidden="true" />}
      </button>

      {(listening || line) && (
        <div className={`voice-hud${line ? (line.ok ? ' vh-ok' : ' vh-no') : ''}`} role="status" aria-live="polite">
          {line ? (
            <>
              <span className="vh-heard">“{line.heard}”</span>
              <span className="vh-arrow">→</span>
              <span className="vh-msg">{line.message}</span>
            </>
          ) : (
            <span className="vh-idle">{interim || 'Say “benchpilot, …”'}</span>
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
