import Timer from './Timer.jsx'
import {
  PHASE_LABEL,
  hasAlternatives,
  selectAlternative,
  resolveConditionals,
  resolveReagents,
  repeatTarget,
  isOpenEndedRepeat,
  isCriticalHazard,
  timerSeconds,
  humanDuration,
} from '../lib/runtime.js'

const KIND_ICON = {
  action: '→',
  wait: '⏱',
  spin: '🌀',
  prepare: '⚗',
  measure: '📏',
  caution: '⚠',
  storage: '❄',
}

// The current instruction, front and center, with every structural feature the
// parse gives us made visible: resolved conditionals, either/or choice, repeat
// tracking, hazards (negatives in red), and a timer for wait/spin steps.
export default function StepCard({
  step,
  answers,
  altIndex,
  onPickAlt,
  passes,
  onPass,
  onAnswerInline,
}) {
  const eff = hasAlternatives(step) ? selectAlternative(step, altIndex) : step
  const kind = eff.kind || 'action'

  const reagents = resolveReagents(eff, answers)
  const { selected, undecided } = resolveConditionals(eff, answers)
  const timed = timerSeconds(step, altIndex)

  const repTarget = repeatTarget(eff)
  const openEnded = isOpenEndedRepeat(eff)
  const showRepeat = eff.repeat && (repTarget > 1 || openEnded)

  return (
    <div className="step-card" key={`${step.index}-${altIndex}`}>
      <span className="kind-badge" data-kind={kind}>
        <span>{KIND_ICON[kind] || '→'}</span>
        {kind}
        {eff.duration_seconds && !timed ? ` · ${humanDuration(eff.duration_seconds)}` : ''}
      </span>

      <p className="instruction">{eff.text || step.text}</p>

      {/* either / or — let the user choose the path, show only the chosen one */}
      {hasAlternatives(step) && (
        <div className="block">
          <div className="block-label">Choose your method</div>
          <div className="alt-switch" role="group" aria-label="alternatives">
            {step.alternatives.map((alt, i) => (
              <button
                key={i}
                aria-pressed={i === altIndex}
                onClick={() => onPickAlt(i)}
              >
                {shortLabel(alt.text)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* resolved conditional (e.g. 350 vs 600 µl) */}
      {selected.length > 0 && (
        <div className="block">
          {selected.map((c, i) => (
            <div className="resolved" key={i}>
              <span className="tag">resolved</span>
              <span>{c.then}</span>
            </div>
          ))}
        </div>
      )}

      {/* unresolved branch — ask inline so the run never stalls silently */}
      {selected.length === 0 && undecided.length > 0 && (
        <div className="block">
          <InlineBranch conditionals={undecided} onAnswerInline={onAnswerInline} />
        </div>
      )}

      {/* reagents + volumes */}
      {reagents.length > 0 && (
        <div className="block">
          <div className="block-label">Reagents</div>
          {reagents.map((r, i) => (
            <div className={`reagent-row${r.state === 'selected' ? ' selected' : ''}`} key={i}>
              <span className="r-name">{r.name}</span>
              {r.condition && r.state !== 'selected' && (
                <span className="r-cond">{r.condition}</span>
              )}
              {r.volume && <span className="r-vol">{r.volume}</span>}
            </div>
          ))}
        </div>
      )}

      {/* repeat loop tracker */}
      {showRepeat && (
        <div className="block">
          <div className="repeat-tracker">
            {!openEnded && (
              <div className="repeat-dots">
                {Array.from({ length: repTarget }).map((_, i) => (
                  <span className={`dot${i < passes ? ' done' : ''}`} key={i} />
                ))}
              </div>
            )}
            <div className="repeat-info">
              {openEnded
                ? `Repeat ${eff.repeat.reason ? '— ' + eff.repeat.reason : ''} · pass ${passes}`
                : `Pass ${Math.min(passes, repTarget)} of ${repTarget}`}
            </div>
            <button className="repeat-btn" onClick={onPass}>
              {openEnded || passes < repTarget ? '+ Count a pass' : '✓ Done'}
            </button>
          </div>
        </div>
      )}

      {/* timer for wait/spin */}
      {timed && <Timer seconds={timed} spin={eff.spin} />}

      {/* hazards — negatives rendered boldly in red */}
      {(eff.hazards || []).length > 0 && (
        <div className="block">
          {eff.hazards.map((h, i) => {
            const critical = isCriticalHazard(h)
            return (
              <div className={`hazard${critical ? ' critical' : ''}`} key={i}>
                <span className="ico">{critical ? '⛔' : '⚠️'}</span>
                <span>{h}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InlineBranch({ conditionals, onAnswerInline }) {
  // Infer which intake key this branch needs, so the inline buttons write the
  // same answer the intake form would.
  const text = conditionals.map((c) => c.condition).join(' ').toLowerCase()
  const isKit = text.includes('mini') || text.includes('micro')
  const isCells = text.includes('≤') || text.includes('>') || text.includes('komórek') || text.includes('cells')

  return (
    <div className="resolved ask">
      <span className="tag">decide</span>
      <span>This step depends on an unanswered question:</span>
      {isCells && (
        <div className="seg">
          <button onClick={() => onAnswerInline('cells', 'le')}>≤ 5×10⁶ cells</button>
          <button onClick={() => onAnswerInline('cells', 'gt')}>&gt; 5×10⁶ cells</button>
        </div>
      )}
      {isKit && (
        <div className="seg">
          <button onClick={() => onAnswerInline('kit', 'mini')}>Mini</button>
          <button onClick={() => onAnswerInline('kit', 'micro')}>Micro</button>
        </div>
      )}
      {!isCells && !isKit && (
        <div className="seg">
          {conditionals.map((c, i) => (
            <span key={i} className="r-cond">
              {c.condition} → {c.then}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function shortLabel(text) {
  if (!text) return 'Option'
  // first few words for the toggle label
  const words = text.split(/\s+/).slice(0, 4).join(' ')
  return words.length < text.length ? words + '…' : words
}
