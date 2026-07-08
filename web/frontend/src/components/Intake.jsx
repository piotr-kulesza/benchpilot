import { useMemo, useState } from 'react'
import {
  deriveIntakeFields,
  isCriticalHazard,
  humanDuration,
  localize,
  stepText,
  reagentName,
  stepHazards,
} from '../lib/runtime.js'

// The "before you start" screen — the Claude payoff made visible: the open
// questions the parse surfaced, a prep-ahead checklist, materials, and hazards.
export default function Intake({ protocol, answers, setAnswers, onStart, lang = 'en' }) {
  const fields = useMemo(() => deriveIntakeFields(protocol), [protocol])
  const prepSteps = protocol.steps.filter((s) => s.prep_ahead)
  const [checked, setChecked] = useState({})

  const globalHazards = useMemo(() => collectGlobalHazards(protocol, lang), [protocol, lang])
  const answeredCount = fields.filter((f) => answers[f.answerKey]).length

  const setAnswer = (key, value) =>
    setAnswers((a) => ({ ...a, [key]: a[key] === value ? undefined : value }))

  return (
    <div className="intake">
      <div className="hero">
        <div className="eyebrow">Before you start</div>
        <h1>{localize(protocol, 'title', lang)}</h1>
        <p className="summary">{localize(protocol, 'summary', lang)}</p>
      </div>

      {fields.length > 0 && (
        <section className="section">
          <h2>Open questions</h2>
          <p className="section-sub">
            benchpilot found {fields.length} decisions this protocol leaves open.
            Answer them once and we&apos;ll resolve the right volumes and paths as you go.
          </p>
          <div className="qgrid">
            {fields.map((f) => {
              const val = answers[f.answerKey]
              return (
                <div className={`qcard${val ? ' answered' : ''}`} key={f.key}>
                  <div className="q">{lang === 'en' ? f.question : f.questionOrig || f.question}</div>
                  {f.where && <div className="where">↳ {f.where}</div>}
                  {f.type === 'choice' ? (
                    <div className="seg">
                      {f.options.map((o) => (
                        <button
                          key={o.value}
                          aria-pressed={val === o.value}
                          onClick={() => setAnswer(f.answerKey, o.value)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      className="text-input"
                      type="text"
                      placeholder={f.placeholder || 'Your answer…'}
                      value={val || ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.answerKey]: e.target.value }))}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {prepSteps.length > 0 && (
        <section className="section">
          <h2>Prep ahead — do these before the clock starts</h2>
          <div className="checklist">
            {prepSteps.map((s) => {
              const done = !!checked[s.index]
              return (
                <div
                  className={`check-item${done ? ' done' : ''}`}
                  key={s.index}
                  onClick={() => setChecked((c) => ({ ...c, [s.index]: !c[s.index] }))}
                >
                  <div className="check-box">{done ? '✓' : ''}</div>
                  <div className="check-body">
                    <div className="txt">{stepText(s, lang)}</div>
                    {(s.reagents.length > 0 || s.duration_seconds) && (
                      <div className="meta">
                        {s.reagents.map((r, i) => (
                          <span className="pill reagent" key={i}>
                            {reagentName(r, lang)}
                            {r.volume ? ` · ${r.volume}` : ''}
                          </span>
                        ))}
                        {s.duration_seconds ? (
                          <span className="pill timer">⏱ within {humanDuration(s.duration_seconds)}</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {globalHazards.length > 0 && (
        <section className="section">
          <h2>Keep in mind</h2>
          {globalHazards.map((h, i) => (
            <div className={`hazard${h.critical ? ' critical' : ''}`} key={i}>
              <span className="ico">{h.critical ? '⛔' : '⚠️'}</span>
              <span>{h.text}</span>
            </div>
          ))}
        </section>
      )}

      {protocol.materials?.length > 0 && (
        <section className="section">
          <h2>Materials</h2>
          <ul className="materials-list">
            {protocol.materials.map((m, i) => (
              <li key={i}>
                {m.name}
                {m.note ? <span className="note"> — {m.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="start-bar">
        <button className="primary-btn" onClick={onStart}>
          Start protocol →
        </button>
        <span className="start-note">
          {answeredCount}/{fields.length} questions answered
          {answeredCount < fields.length ? " — you can answer the rest as you go" : ' — all set'}
        </span>
      </div>
    </div>
  )
}

function collectGlobalHazards(protocol, lang = 'en') {
  // Surface hazards from the notes phase + any critical negatives, deduped.
  // Criticality is judged on the ORIGINAL text; display uses the localized text.
  const out = []
  const seen = new Set()
  for (const s of protocol.steps) {
    const orig = s.hazards || []
    if (s.phase !== 'notes' && !orig.some(isCriticalHazard)) continue
    const shown = stepHazards(s, lang)
    orig.forEach((h, i) => {
      if (seen.has(h)) return
      seen.add(h)
      out.push({ text: shown[i] || h, critical: isCriticalHazard(h) })
    })
  }
  return out.slice(0, 6)
}
