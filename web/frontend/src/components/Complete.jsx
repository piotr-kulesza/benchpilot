import { deriveIntakeFields, localize } from '../lib/runtime.js'
import { Button } from '../ui/primitives.jsx'

// A calm end screen that echoes the decisions the user made — a receipt of the run.
export default function Complete({ protocol, answers, onRestart }) {
  const fields = deriveIntakeFields(protocol)
  const answered = fields
    .map((f) => ({ label: labelFor(f), value: displayValue(f, answers[f.answerKey]) }))
    .filter((x) => x.value)

  return (
    <div className="complete">
      <div className="complete-mark" aria-hidden="true">✓</div>
      <h1>Protocol complete</h1>
      <p>
        You ran <strong>{localize(protocol, 'title')}</strong> end to end. Record your
        inputs and yield, and store the product as the protocol specifies.
      </p>

      {answered.length > 0 && (
        <div className="summary-grid">
          {answered.map((a, i) => (
            <div className="cell" key={i}>
              <div className="k">{a.label}</div>
              <div className="v num">{a.value}</div>
            </div>
          ))}
        </div>
      )}

      <Button variant="primary" onClick={onRestart}>↺ Back to start</Button>
    </div>
  )
}

function labelFor(f) {
  return { kit: 'Kit', cells: 'Input cells', analysis: 'Analysis', rin: 'Target RIN' }[f.key] || 'Answer'
}

function displayValue(f, val) {
  if (!val) return null
  if (f.type === 'choice') {
    const o = f.options.find((o) => o.value === val)
    return o ? o.label : val
  }
  return val
}
