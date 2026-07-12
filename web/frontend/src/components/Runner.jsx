import { useEffect, useMemo, useRef, useState } from 'react'
import StepCard from './StepCard.jsx'
import Complete from './Complete.jsx'
import StationView from '../vessel/StationView.jsx'
import VoiceControl from './VoiceControl.jsx'
import { useCountdown } from '../hooks/useCountdown.js'
import { createSoundboard } from '../lib/sounds.js'
import { Button, Badge } from '../ui/primitives.jsx'
import StepTimeline from './StepTimeline.jsx'
import {
  PHASE_LABEL, selectAlternative, hasAlternatives, stepText,
  effectiveStep, timerSeconds, extractTemperature, elapsedFraction,
  stepHazards, isCriticalHazard, resolveConditionals,
} from '../lib/runtime.js'

const KIND_LABEL = { action: 'Action', wait: 'Wait', spin: 'Spin', prepare: 'Prep', measure: 'Measure', caution: 'Caution', storage: 'Storage' }
const PHASE_TONE = { procedure: 'accent', quality_control: 'info' }

// One step at a time, in a stable 1/3 – 2/3 split: everything textual on the left
// (scrolls, sticky title + controls), the 3D scene on the right (never resizes).
// English-only UI (original + verbatim preserved in the data; restorable in one line).
export default function Runner({ protocol, answers, setAnswers, onExit, initialStep = 0 }) {
  const lang = 'en'
  const steps = protocol.steps
  const [i, setI] = useState(Math.min(initialStep, steps.length - 1))
  const [altByStep, setAltByStep] = useState({})
  const [passByStep, setPassByStep] = useState({})
  const [finished, setFinished] = useState(false)
  // one soundboard for the whole run — the single cue source (voice feedback + the timer
  // alarm). Shared with VoiceControl so both play through the same (gesture-resumed) audio.
  const board = useMemo(() => createSoundboard(), [])

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
  const eff = effectiveStep(step, altIndex)
  const temp = extractTemperature(eff, lang)

  const next = () => { if (i >= steps.length - 1) setFinished(true); else setI((n) => Math.min(n + 1, steps.length - 1)) }
  const back = () => setI((n) => Math.max(0, n - 1))

  // THE most important sound: the timer-done alarm, on the false→true completion edge,
  // whether the run is hand- or voice-driven (a scientist who walked away must hear it).
  const wasDone = useRef(false)
  useEffect(() => {
    if (countdown.done && !wasDone.current) board.timerDone()
    wasDone.current = countdown.done
  }, [countdown.done, board])

  // Voice dispatches into THESE — the exact same callbacks the on-screen buttons call, so
  // hand and voice share one source of truth and can never drift. (board.resume() on start
  // unblocks WebAudio from a real user gesture.)
  const controls = {
    next, back,
    goto: (idx) => setI(Math.max(0, Math.min(idx, steps.length - 1))),
    startTimer: () => { board.resume(); countdown.start() },
    pauseTimer: () => countdown.pause(),
    resetTimer: () => countdown.reset(),
    countPass: () => setPassByStep((m) => ({ ...m, [step.index]: (m[step.index] || 1) + 1 })),
    chooseAlternative: (idx) => setAltByStep((m) => ({ ...m, [step.index]: idx })),
    answerQuestion: (k, v) => setAnswers((a) => ({ ...a, [k]: v })),
  }

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
      stepText: stepText(eff, lang),
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

  if (finished) {
    return <div className="app"><Complete protocol={protocol} answers={answers} onRestart={onExit} /></div>
  }

  const passes = passByStep[step.index] || 0

  return (
    <div className="runner" data-phase={step.phase}>
      <header className="runner-top">
        <button type="button" className="brand rt-brand" onClick={onExit} title="Back to home">
          <span className="dot" /> benchpilot
        </button>
        <StepTimeline steps={steps} current={i} onJump={setI} />
        <VoiceControl controls={controls} context={voiceContext} board={board} />
      </header>

      <div className="runner-body">
        <section className="step-col" aria-label="Current step">
          <div className="step-col-head">
            <div className="sc-badges">
              <Badge tone={PHASE_TONE[step.phase]} dot>{PHASE_LABEL[step.phase] || step.phase}</Badge>
              <Badge>{KIND_LABEL[eff.kind] || eff.kind}</Badge>
            </div>
          </div>

          <div className="step-col-scroll">
            <StepCard
              key={step.index}
              step={step} answers={answers} altIndex={altIndex}
              countdown={countdown} timer={timer} temp={temp}
              onPickAlt={(idx) => setAltByStep((m) => ({ ...m, [step.index]: idx }))}
              passes={Math.max(passes, 1)}
              onPass={() => setPassByStep((m) => ({ ...m, [step.index]: (m[step.index] || 1) + 1 }))}
              onAnswerInline={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))}
              lang={lang}
            />
          </div>

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
            progress={elapsed} running={!!timer?.running} hasTimer={!!timer} done={!!timer?.done}
            altByStep={altByStep} fill
          />
        </section>
      </div>
    </div>
  )
}
