import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVoice } from '../hooks/useVoice.js'
import { createSoundboard } from '../lib/sounds.js'
import { resolveCommand, hasWake, stripWake } from '../lib/voiceIntent.js'
import { dispatchIntent } from '../lib/voiceDispatch.js'
import { createArming, isCancel } from '../lib/voiceArming.js'
import { isScratch, isSaveNote } from '../lib/noteDictation.js'

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
export default function VoiceControl({ controls, context, board: boardProp, note }) {
  const board = useMemo(() => boardProp || createSoundboard(), [boardProp])
  const [line, setLine] = useState(null) // { heard, message, ok }
  const [armed, setArmed] = useState(false)

  // keep live refs so the recognition callbacks never dispatch into a stale step/timer/note
  const ctxRef = useRef(context); ctxRef.current = context
  const ctrlRef = useRef(controls); ctrlRef.current = controls
  const noteRef = useRef(note); noteRef.current = note
  const pendingResetRef = useRef(0)

  // the armed-window machine: wake → armed (blip on the edge); silence → disarm quietly.
  const arming = useMemo(() => createArming({
    onArm: () => { setArmed(true); board.wake() },       // the blip fires the instant the word lands
    // quiet stand-down (never an error sound); silent while a note is being dictated
    onDisarm: () => { setArmed(false); if (!noteRef.current?.active) board.disarm() },
  }), [board])
  useEffect(() => () => arming.destroy(), [arming])

  // interim speech: while dictating a note the words stream INTO the note (live caret);
  // otherwise arm on the wake word (instantly) or just keep the window open.
  const onInterim = useCallback((text) => {
    if (noteRef.current?.active) { noteRef.current.interim(text); return }
    if (hasWake(text)) arming.wake()
    else if (arming.armed) arming.speech()
  }, [arming])

  const onFinal = useCallback(async (transcript) => {
    // NOTE MODE takes precedence: the whole utterance is note content, unless it's a control.
    const n = noteRef.current
    if (n?.active) {
      const said = String(transcript || '').trim()
      if (!said) return
      if (isScratch(said)) { n.discard(); setLine({ heard: said, message: 'Scratched', ok: false }); return }
      if (isSaveNote(said)) { n.commit(); setLine({ heard: said, message: 'Saved', ok: true }); return }
      n.append(said); setLine(null) // the note surface shows it — don't compete with a status line
      return
    }

    const addressed = hasWake(transcript)
    if (addressed) arming.wake()                 // ensure armed (idempotent; blips only if new)
    if (!addressed && !arming.armed) return       // not addressed and not armed → ignore, stay private

    const body = addressed ? stripWake(transcript) : String(transcript || '').trim()
    if (!body) return                             // wake word alone → armed, nothing to do

    if (isCancel(body)) { arming.cancel(); setLine({ heard: body, message: 'Stood down', ok: false }); return }

    const intent = await resolveCommand({ command: body, context: ctxRef.current, llm: relayLLM })

    // "note …" / "make a note" ENTERS dictation mode (its own record), not a one-shot save
    if (intent.action === 'add_note') {
      const c = ctxRef.current
      n?.begin({ step: c?.stepNumber, stepTitle: c?.stepTitle, seed: intent.args?.text })
      board.record(); setLine(null) // note mode takes over; the armed window lapses silently
      return
    }

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
      <div className="voice-dock voice-na">
        <div className="vd-main"><span className="vd-ico"><MicIcon muted /></span>
          <span className="vd-text"><b>Voice unavailable</b><small>Needs Chrome or Edge</small></span></div>
      </div>
    )
  }

  const denied = error === 'mic-denied' || error === 'no-mic'
  const noteActive = !!note?.active
  const state = denied ? 'denied' : noteActive ? 'note' : armed ? 'armed' : listening ? 'live' : 'off'

  // A prominent, full-width VOICE DOCK — the product's most distinctive capability lives here,
  // not in a corner. Off = an inviting CTA; on = a loud state + the vocabulary + the transcript.
  return (
    <div className={`voice-dock voice-${state}`} role="region" aria-label="Voice control">
      {!listening ? (
        <button className="vd-main vd-enable" type="button" onClick={onToggle}>
          <span className="vd-ico"><MicIcon muted /></span>
          <span className="vd-text">
            <b>{denied ? 'Microphone blocked' : 'Run hands-free with voice'}</b>
            <small>{denied ? 'Allow the mic in your browser, then tap to enable'
              : 'Tap to enable, then say “benchpilot, next”'}</small>
          </span>
          {!denied && <span className="vd-cta">Enable voice</span>}
        </button>
      ) : (
        <>
          <div className="vd-state" role="status" aria-live="polite">
            <span className="vd-ico"><MicIcon /></span>
            <span className="vd-big">
              {noteActive ? 'Recording a note' : armed ? 'Ready — speak now' : 'Listening for “benchpilot”'}
            </span>
            {listening && !armed && !noteActive && <span className="mic-pulse" aria-hidden="true" />}
            <button className="vd-stop" type="button" onClick={onToggle} title="Turn off voice">Stop</button>
          </div>

          {/* the note surface (step panel) owns the display while dictating — don't compete here */}
          {!noteActive && (
            <div className="vd-hud">
              {line ? (
                <><span className="vd-heard">“{line.heard}”</span><span className="vd-arrow">→</span><span className={`vd-msg${line.ok ? ' vd-ok' : ' vd-no'}`}>{line.message}</span></>
              ) : armed ? (
                <span className="vd-live">{interim ? `“${interim}”` : 'Say a command…'}</span>
              ) : interim ? (
                <span className="vd-live">“{interim}”</span>
              ) : (
                <span className="vd-vocab">Try: <em>next</em><em>start the timer</em><em>how long is left</em><em>note: …</em></span>
              )}
            </div>
          )}
        </>
      )}
    </div>
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
