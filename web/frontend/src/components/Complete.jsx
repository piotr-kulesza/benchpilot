import { deriveIntakeFields } from '../lib/runtime.js'

// A calm end screen that echoes the decisions the user made — a nice receipt of
// the run and a reminder of what to record.
export default function Complete({ protocol, answers, onRestart }) {
  const fields = deriveIntakeFields(protocol)
  const answered = fields
    .map((f) => ({ label: labelFor(f), value: displayValue(f, answers[f.answerKey]) }))
    .filter((x) => x.value)

  return (
    <div className="complete">
      <div className="checkmark">✓</div>
      <h1>Protocol complete</h1>
      <p>
        You ran <strong>{protocol.title}</strong> end to end. Record your input cell
        count and yield, and store the RNA at −80&nbsp;°C.
      </p>

      {answered.length > 0 && (
        <div className="summary-grid">
          {answered.map((a, i) => (
            <div className="cell" key={i}>
              <div className="k">{a.label}</div>
              <div className="v">{a.value}</div>
            </div>
          ))}
        </div>
      )}

      <button className="primary-btn" onClick={onRestart}>
        ↺ Back to start
      </button>
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
