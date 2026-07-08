import { useEffect, useMemo, useState } from 'react'
import StepCard from './StepCard.jsx'
import Complete from './Complete.jsx'
import { PHASE_LABEL, selectAlternative, hasAlternatives, stepText } from '../lib/runtime.js'

// One step at a time. Owns navigation, per-step alternative choice and repeat
// pass counts, and a persistent look-ahead so a beginner can prep during a timer.
export default function Runner({ protocol, answers, setAnswers, onExit, initialStep = 0, lang = 'en' }) {
  const steps = protocol.steps
  const [i, setI] = useState(Math.min(initialStep, steps.length - 1))
  const [altByStep, setAltByStep] = useState({})
  const [passByStep, setPassByStep] = useState({})
  const [finished, setFinished] = useState(false)

  const atEnd = i >= steps.length
  const step = steps[i]

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

  const altIndex = altByStep[step.index] || 0
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

      <div className="stage">
        <StepCard
          key={step.index}
          step={step}
          answers={answers}
          altIndex={altIndex}
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
