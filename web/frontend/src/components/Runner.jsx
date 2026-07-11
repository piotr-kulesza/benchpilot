import { useEffect, useMemo, useState } from 'react'
import StepCard from './StepCard.jsx'
import Complete from './Complete.jsx'
import StationView from '../vessel/StationView.jsx'
import { useCountdown } from '../hooks/useCountdown.js'
import {
  PHASE_LABEL,
  selectAlternative,
  hasAlternatives,
  stepText,
  effectiveStep,
  timerSeconds,
  extractTemperature,
} from '../lib/runtime.js'

// One step at a time. Owns navigation, per-step alternative choice and repeat
// pass counts, and a persistent look-ahead so a beginner can prep during a timer.
export default function Runner({ protocol, answers, setAnswers, onExit, initialStep = 0, lang = 'en' }) {
  const steps = protocol.steps
  const [i, setI] = useState(Math.min(initialStep, steps.length - 1))
  const [altByStep, setAltByStep] = useState({})
  const [passByStep, setPassByStep] = useState({})
  const [finished, setFinished] = useState(false)

  const step = steps[Math.min(i, steps.length - 1)]
  const altIndex = altByStep[step.index] || 0

  // One clock for the whole step, shared by the 3D scene (incubation ring /
  // reader gauge) and the step card's timer strip. useCountdown resets when the
  // seconds change (i.e. on step or alternative change).
  const timed = timerSeconds(step, altIndex)
  const countdown = useCountdown(timed || 0)
  const timer = timed
    ? {
        remaining: countdown.remaining,
        fraction: timed > 0 ? countdown.remaining / timed : 1,
        running: countdown.running,
        done: countdown.done,
      }
    : null
  // the ring/gauge fill as time ELAPSES (1 = full window remaining → 0 elapsed)
  const elapsed = timer ? 1 - timer.fraction : 1
  const eff = effectiveStep(step, altIndex)
  const temp = extractTemperature(eff, lang)

  const next = () => {
    if (i >= steps.length - 1) setFinished(true)
    else setI((n) => Math.min(n + 1, steps.length - 1))
  }
  const back = () => setI((n) => Math.max(0, n - 1))

  // spacebar = next (gloved hands tap a trackpad); ← / → also navigate.
  useEffect(() => {
    const onKey = (e) => {
      if (finished) return
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        next()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, finished])

  const nextPreview = useMemo(() => {
    const n = steps[i + 1]
    if (!n) return null
    const eff = hasAlternatives(n) ? selectAlternative(n, altByStep[n.index] || 0) : n
    return stepText(eff, lang) || stepText(n, lang)
  }, [i, steps, altByStep, lang])

  if (finished) {
    return <Complete protocol={protocol} answers={answers} onRestart={onExit} />
  }

  const passes = passByStep[step.index] || 0
  const progress = ((i + 1) / steps.length) * 100

  return (
    <div className="runner">
      <div className="run-top">
        <div className="run-meta">
          <span className="phase-pill" data-phase={step.phase}>
            {PHASE_LABEL[step.phase] || step.phase}
          </span>
          <span className="spacer" />
          <span className="step-count">
            Step {i + 1} of {steps.length}
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* persistent station-line hero — mounted once, so the sample and camera
          travel as you navigate rather than the canvas remounting per step */}
      <div className="station-hero">
        <StationView
          protocol={protocol}
          activeIndex={i}
          answers={answers}
          lang={lang}
          progress={elapsed}
          running={!!timer?.running}
          temp={temp}
        />
      </div>

      <div className="stage">
        <StepCard
          key={step.index}
          step={step}
          answers={answers}
          altIndex={altIndex}
          countdown={countdown}
          timer={timer}
          onPickAlt={(idx) => setAltByStep((m) => ({ ...m, [step.index]: idx }))}
          passes={Math.max(passes, 1)}
          onPass={() =>
            setPassByStep((m) => ({ ...m, [step.index]: (m[step.index] || 1) + 1 }))
          }
          onAnswerInline={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))}
          lang={lang}
        />
      </div>

      <div className="run-foot">
        {nextPreview ? (
          <div className="lookahead">
            <span className="la-label">Next</span>
            <span className="la-text">{nextPreview}</span>
          </div>
        ) : (
          <div className="lookahead end">Last step — you&apos;re almost done</div>
        )}

        <div className="nav">
          <button className="nav-btn" onClick={back} disabled={i === 0}>
            ← Back
          </button>
          <button className="nav-btn next" onClick={next}>
            {i >= steps.length - 1 ? 'Finish ✓' : 'Next →'}
          </button>
        </div>
        <div className="nav-hint">
          <kbd>Space</kbd> next · <kbd>←</kbd> <kbd>→</kbd> navigate
        </div>
      </div>
    </div>
  )
}
