import { useEffect, useMemo, useState } from 'react'
import StepCard from './StepCard.jsx'
import Complete from './Complete.jsx'
import StationView from '../vessel/StationView.jsx'
import { useCountdown } from '../hooks/useCountdown.js'
import { Button, Badge, Progress } from '../ui/primitives.jsx'
import {
  PHASE_LABEL, selectAlternative, hasAlternatives, stepText,
  effectiveStep, timerSeconds, extractTemperature,
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

  const step = steps[Math.min(i, steps.length - 1)]
  const altIndex = altByStep[step.index] || 0

  // one clock per step, shared by the scene (ring/gauge) and the timer strip.
  const timed = timerSeconds(step, altIndex)
  const countdown = useCountdown(timed || 0)
  const timer = timed
    ? { remaining: countdown.remaining, fraction: timed > 0 ? countdown.remaining / timed : 1, running: countdown.running, done: countdown.done }
    : null
  const elapsed = timer ? 1 - timer.fraction : 1
  const eff = effectiveStep(step, altIndex)
  const temp = extractTemperature(eff, lang)

  const next = () => { if (i >= steps.length - 1) setFinished(true); else setI((n) => Math.min(n + 1, steps.length - 1)) }
  const back = () => setI((n) => Math.max(0, n - 1))

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
  const progress = ((i + 1) / steps.length) * 100

  return (
    <div className="runner" data-phase={step.phase}>
      <header className="runner-top">
        <div className="brand"><span className="dot" /> benchpilot</div>
        <div className="rt-progress"><Progress value={progress} label="protocol progress" /></div>
        <span className="rt-count num">{i + 1} / {steps.length}</span>
        <span className="spacer" />
        <Button variant="ghost" size="sm" onClick={onExit}>← Home</Button>
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
            progress={elapsed} running={!!timer?.running} altByStep={altByStep} fill
          />
        </section>
      </div>
    </div>
  )
}
