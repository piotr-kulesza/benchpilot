import { useMemo, useState } from 'react'
import {
  deriveIntakeFields, isCriticalHazard, humanDuration, localize,
  stepText, reagentName, reagentVolume, stepHazards, PHASE_LABEL,
} from '../lib/runtime.js'
import { Panel, Card, Input, Alert, Button, Chip, Segmented, Badge } from '../ui/primitives.jsx'

// The "before you start" form — the Claude payoff made visible: the open questions the
// protocol never asked, a prep-ahead checklist, materials, hazards, and non-bench
// notes. Clear grouping, answers persist, one obvious "Start protocol".
export default function Intake({ protocol, notes = [], answers, setAnswers, onStart, lang = 'en' }) {
  const fields = useMemo(() => deriveIntakeFields(protocol, lang), [protocol, lang])
  const prepSteps = protocol.steps.filter((s) => s.prep_ahead)
  const [checked, setChecked] = useState({})
  const globalHazards = useMemo(() => collectGlobalHazards(protocol, lang), [protocol, lang])
  const answeredCount = fields.filter((f) => answers[f.answerKey]).length

  const setAnswer = (key, value) => setAnswers((a) => ({ ...a, [key]: a[key] === value ? undefined : value }))

  return (
    <div className="intake">
      <header className="intake-hero">
        <span className="eyebrow">Before you start</span>
        <h1>{localize(protocol, 'title', lang)}</h1>
        <p className="summary">{localize(protocol, 'summary', lang)}</p>
      </header>

      {fields.length > 0 && (
        <Panel title="Open questions" sub={`benchpilot found ${fields.length} decision${fields.length === 1 ? '' : 's'} this protocol leaves open. Answer them once and we resolve the right volumes and paths as you go.`}>
          <div className="qgrid">
            {fields.map((f) => {
              const val = answers[f.answerKey]
              return (
                <Card key={f.key} className={`qcard${val ? ' answered' : ''}`}>
                  <div className="q">{f.question}</div>
                  {f.where && <div className="where">↳ {f.where}</div>}
                  {f.type === 'choice' ? (
                    <Segmented ariaLabel={f.question} value={val} onChange={(v) => setAnswer(f.answerKey, v)} options={f.options} />
                  ) : (
                    <Input type="text" placeholder={f.placeholder || 'Your answer…'} value={val || ''} aria-label={f.question}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.answerKey]: e.target.value }))} />
                  )}
                </Card>
              )
            })}
          </div>
        </Panel>
      )}

      {prepSteps.length > 0 && (
        <Panel title="Prep ahead" sub="Do these before the clock starts.">
          <div className="checklist">
            {prepSteps.map((s) => {
              const done = !!checked[s.index]
              return (
                <button type="button" className={`check-item${done ? ' done' : ''}`} key={s.index}
                  aria-pressed={done} onClick={() => setChecked((c) => ({ ...c, [s.index]: !c[s.index] }))}>
                  <span className="check-box" aria-hidden="true">{done ? '✓' : ''}</span>
                  <span className="check-body">
                    <span className="txt">{stepText(s, lang)}</span>
                    {(s.reagents.length > 0 || s.duration_seconds) && (
                      <span className="meta">
                        {s.reagents.map((r, i) => (
                          <Chip key={i} tone="accent" k={reagentName(r, lang)} v={r.volume ? reagentVolume(r, lang) : undefined} num />
                        ))}
                        {s.duration_seconds ? <Chip k="within" v={humanDuration(s.duration_seconds)} num /> : null}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </Panel>
      )}

      {globalHazards.length > 0 && (
        <Panel title="Keep in mind">
          {globalHazards.map((h, i) => (
            <Alert key={i} tone={h.critical ? 'hazard' : 'warn'} critical={h.critical}>{h.text}</Alert>
          ))}
        </Panel>
      )}

      {protocol.materials?.length > 0 && (
        <Panel title="Materials">
          <ul className="materials-list">
            {protocol.materials.map((m, i) => (
              <li key={i}>
                {localize(m, 'name', lang)}
                {localize(m, 'note', lang) ? <span className="note"> — {localize(m, 'note', lang)}</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {notes.length > 0 && (
        <Panel title="Notes & non-bench steps" sub={`${notes.length} step${notes.length === 1 ? '' : 's'} with nothing to animate — prep, record-keeping and remarks. The walkthrough covers the bench actions.`}>
          <ul className="notes-list">
            {notes.map((s, i) => (
              <li key={i} className="note-item">
                <Badge>{PHASE_LABEL[s.phase] || s.phase}</Badge>
                <span className="note-text">{stepText(s, lang)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="start-bar">
        <Button variant="primary" size="lg" onClick={onStart}>Start protocol →</Button>
        <span className="start-note num">
          {answeredCount}/{fields.length} answered
          {answeredCount < fields.length ? ' — you can answer the rest as you go' : ' — all set'}
        </span>
      </div>
    </div>
  )
}

function collectGlobalHazards(protocol, lang = 'en') {
  // Surface hazards from the notes phase + any critical negatives, deduped.
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
