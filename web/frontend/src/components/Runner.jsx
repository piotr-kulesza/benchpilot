import { useEffect, useMemo, useRef, useState } from 'react'
import StepCard from './StepCard.jsx'
import Complete from './Complete.jsx'
import StationView from '../vessel/StationView.jsx'
import VoiceControl from './VoiceControl.jsx'
import BrandWord from '../ui/BrandWord.jsx'
import NoteComposer from './NoteComposer.jsx'
import NoteDictation from './NoteDictation.jsx'
import RunRecord from './RunRecord.jsx'
import { useCountdown } from '../hooks/useCountdown.js'
import { useRunLog } from '../hooks/useRunLog.js'
import { useRunState } from '../hooks/useRunState.js'
import { useNoteDictation } from '../hooks/useNoteDictation.js'
import { createSoundboard } from '../lib/sounds.js'
import { Button } from '../ui/primitives.jsx'
import StepTimeline from './StepTimeline.jsx'
import {
  selectAlternative, hasAlternatives, stepText, shortLabel,
  effectiveStep, timerSeconds, extractTemperature, elapsedFraction,
  stepHazards, isCriticalHazard, resolveConditionals,
} from '../lib/runtime.js'


// human labels for the intake parameters we log (fall back to raw key/value otherwise)
const ANSWER_LABEL = { cells: 'Cell count', kit: 'Kit' }
const ANSWER_VALUE = { cells: { le: '≤5×10⁶ cells', gt: '>5×10⁶ cells' }, kit: { mini: 'Mini', micro: 'Micro' } }
const answerLabel = (k) => ANSWER_LABEL[k] || k
const answerValueLabel = (k, v) => ANSWER_VALUE[k]?.[v] || v

// One step at a time, in a stable 1/3 – 2/3 split: everything textual on the left
// (scrolls, sticky title + controls), the 3D scene on the right (never resizes).
// English-only UI (original + verbatim preserved in the data; restorable in one line).
export default function Runner({ protocol, answers, setAnswers, onExit, initialStep = 0, bench = 'dark', runId = 'default' }) {
  const lang = 'en'
  const steps = protocol.steps
  // ALL run-scoped state hangs off the run id: a reload resumes it, a new run starts empty.
  const rs = useRunState(runId, initialStep)
  const i = Math.min(rs.step, steps.length - 1)
  const setI = rs.setStep
  const altByStep = rs.altByStep, setAltByStep = rs.setAltByStep
  const passByStep = rs.passByStep, setPassByStep = rs.setPassByStep
  const ackedHazards = rs.ackedHazards, setAckedHazards = rs.setAckedHazards
  const finished = rs.finished, setFinished = rs.setFinished
  const [recordOpen, setRecordOpen] = useState(false)
  // one soundboard for the whole run — the single cue source (voice feedback + the timer
  // alarm). Shared with VoiceControl so both play through the same (gesture-resumed) audio.
  const board = useMemo(() => createSoundboard(), [])

  // the run log — keyed by the run id (resumes on reload, empty for a new run). Emitted ONLY
  // from the control callbacks below, the single choke point buttons and voice both hit.
  const log = useRunLog(runId)
  const protoName = stepText({ text: protocol?.title, text_en: protocol?.title_en }, lang) || protocol?.title || 'Protocol'
  const titleOf = (idx) => shortLabel(steps[idx], lang)

  // dictated-note mode: a note anchored to the step it was begun on. On commit it lands in
  // the log (highest-value row); on discard nothing is saved. Cues via the shared board.
  const note = useNoteDictation({
    onCommit: (text, meta) => {
      const t = String(text || '').trim()
      if (!t) return
      log.emit('note', { step: meta?.step ?? i + 1, stepTitle: meta?.stepTitle ?? titleOf(i), text: t })
      board.accepted()
    },
    onDiscard: () => board.discard(),
  })

  const step = steps[Math.min(i, steps.length - 1)]
  const altIndex = altByStep[step.index] || 0

  // one clock per step, shared by the scene (ring/gauge) and the timer strip.
  const timed = timerSeconds(step, altIndex)
  const countdown = useCountdown(timed || 0)
  const timer = timed
    ? { remaining: countdown.remaining, fraction: timed > 0 ? countdown.remaining / timed : 1, running: countdown.running, done: countdown.done }
    : null
  // ring fill == digits, one clock: both read countdown.remaining against `timed`.
  const elapsed = timer ? elapsedFraction(countdown.remaining, timed) : 1
  // The 3D scene reads the clock from a STABLE ref, never from changing props: the
  // countdown ticks at 10 Hz, and if that flowed into the scene as props it would
  // reconcile the whole R3F tree ten times a second while three.js is holding 60 fps.
  // We mutate .current in place (identity never changes) so the memoised <StationView>
  // never re-renders on a tick; useFrame pulls the live value. The left-panel digits
  // stay on state — that re-render is cheap DOM.
  const sceneTimer = useRef({ progress: 1, running: false, hasTimer: false, done: false })
  sceneTimer.current.progress = elapsed
  sceneTimer.current.running = !!timer?.running
  sceneTimer.current.hasTimer = !!timer
  sceneTimer.current.done = !!timer?.done
  const eff = effectiveStep(step, altIndex)
  const temp = extractTemperature(eff, lang)

  // clicking Next COMPLETES the current step (that's what counts as done — not merely
  // viewing/jumping to it), then advances or finishes.
  const next = () => {
    log.emit('step_completed', { step: i + 1, stepTitle: titleOf(i) })
    if (i >= steps.length - 1) setFinished(true)
    else setI((n) => Math.min(n + 1, steps.length - 1))
  }
  const back = () => setI((n) => Math.max(0, n - 1))

  // timer controls, wrapped once so BOTH the on-screen strip and the voice dispatcher run
  // the identical path — countdown + a log event. Never call countdown.start/pause/reset
  // directly from the UI, or a click and a spoken command would log differently.
  const timerStartedRef = useRef(false)
  const startTimer = () => {
    board.resume()
    if (!timerStartedRef.current) { timerStartedRef.current = true; log.emit('timer_started', { step: i + 1, stepTitle: titleOf(i), nominal: timed }) }
    else log.emit('timer_resumed', { step: i + 1, stepTitle: titleOf(i) })
    countdown.start()
  }
  const pauseTimer = () => { log.emit('timer_paused', { step: i + 1, stepTitle: titleOf(i), elapsed: Math.round((timed || 0) - countdown.remaining) }); countdown.pause() }
  const resetTimer = () => { log.emit('timer_reset', { step: i + 1, stepTitle: titleOf(i), elapsed: Math.round((timed || 0) - countdown.remaining) }); countdown.reset(); timerStartedRef.current = false }

  // THE most important sound: the timer-done alarm, on the false→true completion edge,
  // whether the run is hand- or voice-driven (a scientist who walked away must hear it).
  // The same edge logs the completion with its real (nominal) duration.
  const wasDone = useRef(false)
  useEffect(() => {
    if (countdown.done && !wasDone.current) { board.timerDone(); log.emit('timer_completed', { step: i + 1, stepTitle: titleOf(i), nominal: timed }) }
    wasDone.current = countdown.done
  }, [countdown.done]) // eslint-disable-line react-hooks/exhaustive-deps

  // Voice dispatches into THESE — the exact same callbacks the on-screen buttons call, so
  // hand and voice share one source of truth and can never drift. Each mutation ALSO emits
  // its log event here, at the single seam.
  const controls = {
    next, back,
    goto: (idx) => setI(Math.max(0, Math.min(idx, steps.length - 1))),
    startTimer, pauseTimer, resetTimer,
    countPass: () => {
      const nc = (passByStep[step.index] || 1) + 1
      setPassByStep((m) => ({ ...m, [step.index]: nc }))
      log.emit('pass_counted', { step: i + 1, stepTitle: titleOf(i), pass: nc })
    },
    chooseAlternative: (idx) => {
      setAltByStep((m) => ({ ...m, [step.index]: idx }))
      log.emit('alternative_chosen', { step: i + 1, stepTitle: titleOf(i), index: idx, label: shortLabel(selectAlternative(step, idx), lang) })
    },
    answerQuestion: (k, v) => {
      setAnswers((a) => ({ ...a, [k]: v }))
      log.emit('intake_answer', { step: i + 1, stepTitle: titleOf(i), key: k, value: v, label: answerLabel(k), valueLabel: answerValueLabel(k, v) })
    },
    addNote: (text) => {
      const t = String(text || '').trim()
      if (t) log.emit('note', { step: i + 1, stepTitle: titleOf(i), text: t })
    },
    ackHazard: (text) => {
      const key = `${i}:${text}`
      if (ackedHazards[key]) return
      setAckedHazards((m) => ({ ...m, [key]: true }))
      log.emit('hazard_ack', { step: i + 1, stepTitle: titleOf(i), text })
    },
  }

  // seed the log ONCE per run: run started + the intake answers (the parameters of this
  // run). Arriving at a step is NOT logged — a step is only recorded when it's COMPLETED
  // (see next()). Ref guards against StrictMode's double-invoke; a resumed run keeps its log.
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    if (log.events.length === 0) {
      log.emit('run_started', { step: i + 1, stepTitle: titleOf(i), name: protoName })
      for (const [k, v] of Object.entries(answers || {})) {
        if (v == null || v === '') continue
        log.emit('intake_answer', { step: i + 1, stepTitle: titleOf(i), key: k, value: v, label: answerLabel(k), valueLabel: answerValueLabel(k, v) })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // each step gets one fresh timer; reset the started-flag so re-entering logs a start, not a resume
  useEffect(() => { timerStartedRef.current = false }, [i])

  // run completed — logged once when the last step is finished
  const finishedRef = useRef(false)
  useEffect(() => {
    if (finished && !finishedRef.current) { finishedRef.current = true; log.emit('run_completed', { step: i + 1, stepTitle: titleOf(i) }) }
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  // leaving mid-run is a real outcome worth recording (explicit exit, not StrictMode churn)
  const handleExit = () => { if (!finishedRef.current) log.emit('run_abandoned', { step: i + 1, stepTitle: titleOf(i) }); onExit() }

  // Read-only context the intent layer needs to resolve "how long is left", "start it",
  // "the micro kit", and to gate a hazard cue on landing.
  const voiceContext = useMemo(() => {
    const hz = stepHazards(eff, lang)
    const hasHazard = hz.some((h, idx) => isCriticalHazard(h) || isCriticalHazard((eff.hazards || [])[idx]))
    const alternatives = hasAlternatives(step) ? step.alternatives.map((a) => stepText(a, lang)) : []
    const { undecided } = resolveConditionals(eff, answers)
    let openQuestion = null
    if (undecided.length) {
      const t = undecided.map((c) => c.condition).join(' ').toLowerCase()
      if (t.includes('mini') || t.includes('micro')) {
        openQuestion = { key: 'kit', prompt: 'Which kit — mini or micro?', options: [{ value: 'mini', label: 'mini' }, { value: 'micro', label: 'micro' }] }
      } else if (/[≤>]|cells|komórek/.test(t)) {
        openQuestion = { key: 'cells', prompt: 'How many cells — ≤5×10⁶ or more?', options: [{ value: 'le', label: '≤5×10⁶' }, { value: 'gt', label: '>5×10⁶' }] }
      }
    }
    return {
      stepIndex: i, stepNumber: i + 1, stepCount: steps.length,
      stepText: stepText(eff, lang), stepTitle: titleOf(i),
      hasTimer: !!timer, running: !!timer?.running, done: !!timer?.done, remaining: timer?.remaining ?? 0,
      alternatives, openQuestion, hasHazard,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, steps.length, eff, step, answers, timer?.remaining, timer?.running, timer?.done])

  // keyboard: → / space = next, ← = back (gloved hands, arrows for review).
  useEffect(() => {
    const onKey = (e) => {
      if (finished) return
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); next() }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); back() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, finished]) // eslint-disable-line react-hooks/exhaustive-deps

  const nextPreview = useMemo(() => {
    const n = steps[i + 1]
    if (!n) return null
    const e = hasAlternatives(n) ? selectAlternative(n, altByStep[n.index] || 0) : n
    return stepText(e, lang) || stepText(n, lang)
  }, [i, steps, altByStep])

  const recordEl = (
    <RunRecord
      open={recordOpen} events={log.events} meta={{ protocol: protoName }}
      onClose={() => setRecordOpen(false)} onClear={log.clear}
    />
  )

  if (finished) {
    return (
      <div className="app">
        <Complete protocol={protocol} answers={answers} onRestart={handleExit} onViewRecord={() => setRecordOpen(true)} />
        {recordEl}
      </div>
    )
  }

  const passes = passByStep[step.index] || 0

  return (
    <div className="runner" data-phase={step.phase}>
      <header className="runner-top">
        <button type="button" className="brand rt-brand" onClick={handleExit} title="Back to home">
          <BrandWord />
        </button>
        <StepTimeline steps={steps} current={i} onJump={setI} />
        <button className="log-btn" type="button" onClick={() => setRecordOpen(true)} title="Run record">
          <LogGlyph /><span className="log-btn-label">Run log</span>
          {log.events.length > 0 && <span className="log-count num">{log.events.length}</span>}
        </button>
      </header>

      <div className="runner-body">
        <section className="step-col" aria-label="Current step">
          <div className="step-col-scroll">
            {note.active && <NoteDictation note={note} />}
            <StepCard
              key={step.index}
              step={step} answers={answers} altIndex={altIndex}
              countdown={{ remaining: countdown.remaining, running: countdown.running, done: countdown.done, start: startTimer, pause: pauseTimer, reset: resetTimer }}
              timer={timer} temp={temp}
              onPickAlt={controls.chooseAlternative}
              passes={Math.max(passes, 1)}
              onPass={controls.countPass}
              onAnswerInline={controls.answerQuestion}
              onAckHazard={controls.ackHazard}
              ackedHazards={ackedHazards} stepIndex={i}
              lang={lang}
            />
            <NoteComposer onAdd={controls.addNote} step={i + 1} />
          </div>

          <VoiceControl controls={controls} context={voiceContext} board={board} note={note} />

          <div className="step-col-foot">
            <div className="look-ahead">
              <span className="la-label">Next</span>
              <span className="la-text">{nextPreview || "Last step — you're almost done."}</span>
            </div>
            <div className="nav-row">
              <Button variant="secondary" onClick={back} disabled={i === 0}>← Back</Button>
              <Button variant="primary" onClick={next}>{i >= steps.length - 1 ? 'Finish ✓' : 'Next →'}</Button>
            </div>
          </div>
        </section>

        <section className="stage-col" aria-label="3D scene">
          <StationView
            protocol={protocol} activeIndex={i} answers={answers} lang={lang}
            timerRef={sceneTimer}
            altByStep={altByStep} bench={bench} fill
          />
        </section>
      </div>

      {recordEl}
    </div>
  )
}

function LogGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
