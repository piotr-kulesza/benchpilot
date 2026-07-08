import { useEffect, useState } from 'react'
import Intake from './components/Intake.jsx'
import Runner from './components/Runner.jsx'

// Default data source is the bundled example, so the demo renders with ZERO
// backend. A future live-parse endpoint can be pointed at with VITE_API_BASE
// without touching this default path.
const API_BASE = import.meta.env.VITE_API_BASE || ''

// A run can be deep-linked (handy for sharing / demoing a specific step):
//   ?run=1            -> jump straight into the runner
//   ?run=1&step=5     -> ...at step index 5
//   ?kit=mini&cells=le -> preset intake answers
function readUrlState() {
  const q = new URLSearchParams(window.location.search)
  const answers = {}
  for (const k of ['kit', 'cells', 'analysis', 'rin']) {
    if (q.get(k)) answers[k] = q.get(k)
  }
  return {
    phase: q.get('run') ? 'run' : 'intake',
    step: q.get('step') ? Math.max(0, parseInt(q.get('step'), 10) - 1) : 0,
    lang: q.get('lang') === 'orig' ? 'orig' : 'en', // default English
    answers,
  }
}

export default function App() {
  const initial = readUrlState()
  const [protocol, setProtocol] = useState(null)
  const [error, setError] = useState(null)
  const [phase, setPhase] = useState(initial.phase) // 'intake' | 'run'
  const [lang, setLang] = useState(initial.lang) // 'en' | 'orig'
  const [answers, setAnswers] = useState(initial.answers)

  useEffect(() => {
    // Always load the bundled example. (The live path, if built, would POST to
    // `${API_BASE}/api/parse` and feed the same setProtocol — see web/api.py.)
    fetch('parsed.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load bundled protocol (${r.status})`)
        return r.json()
      })
      .then(setProtocol)
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <div className="app">
        <div className="errbox">
          <div>
            <strong>Failed to load protocol.</strong>
            <div style={{ marginTop: 8 }}>{error}</div>
          </div>
        </div>
      </div>
    )
  }

  if (!protocol) {
    return (
      <div className="app">
        <div className="loading">Loading protocol…</div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="shell">
        <div className="masthead">
          <div className="brand">
            <span className="dot" />
            benchpilot
            <small>&nbsp;protocol player</small>
          </div>
          <span className="spacer" />
          <LangToggle lang={lang} setLang={setLang} />
          {phase === 'run' && (
            <button className="ghost-btn" onClick={() => setPhase('intake')}>
              ← Setup
            </button>
          )}
        </div>

        {phase === 'intake' ? (
          <Intake
            protocol={protocol}
            answers={answers}
            setAnswers={setAnswers}
            onStart={() => setPhase('run')}
            lang={lang}
          />
        ) : (
          <Runner
            protocol={protocol}
            answers={answers}
            setAnswers={setAnswers}
            initialStep={initial.step}
            onExit={() => setPhase('intake')}
            lang={lang}
          />
        )}
      </div>
    </div>
  )
}

// A compact EN / original language toggle. The source language name isn't in the
// schema, so the non-English label is simply "Original".
function LangToggle({ lang, setLang }) {
  return (
    <div className="lang-toggle" role="group" aria-label="language">
      <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
        EN
      </button>
      <button aria-pressed={lang === 'orig'} onClick={() => setLang('orig')}>
        Original
      </button>
    </div>
  )
}
