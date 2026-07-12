import TimerControls from './Timer.jsx'
import { Button, Chip, Alert, Badge } from '../ui/primitives.jsx'
import {
  hasAlternatives,
  selectAlternative,
  resolveConditionals,
  resolveReagents,
  repeatTarget,
  isOpenEndedRepeat,
  isCriticalHazard,
  humanDuration,
  stepText,
  stepHazards,
  reagentName,
  reagentVolume,
  reagentCondition,
  localize,
} from '../lib/runtime.js'

// The step BODY, rendered in the left column's scroll region. The instruction is the
// single most important thing in the app — it is large, full line-height, and NEVER
// truncated. Everything structural the parse gives us lives here too: the moved-in
// scene data (temp / ×g), either/or choice, resolved conditionals, reagents, tracked
// repeats, timer, and hazards (negatives loudest). English-only (lang defaults 'en').
export default function StepCard({
  step, answers, altIndex, countdown, timer, onPickAlt, passes, onPass, onAnswerInline, temp, lang = 'en',
}) {
  const eff = hasAlternatives(step) ? selectAlternative(step, altIndex) : step

  const reagents = resolveReagents(eff, answers)
  const { selected, undecided } = resolveConditionals(eff, answers)
  const timed = !!timer

  const repTarget = repeatTarget(eff)
  const openEnded = isOpenEndedRepeat(eff)
  const showRepeat = eff.repeat && (repTarget > 1 || openEnded)
  const hazards = stepHazards(eff, lang)

  const rcf = eff.spin?.rcf_min ? `≥ ${eff.spin.rcf_min.toLocaleString()} ×g` : null
  const duration = eff.duration_seconds && !timed ? humanDuration(eff.duration_seconds) : null

  return (
    <div className="step-body">
      {/* THE instruction — the most important content in the app */}
      <p className="instruction">{stepText(eff, lang) || stepText(step, lang)}</p>

      {/* scene data that used to float over the 3D: temperature, spin force, duration */}
      {(temp || rcf || duration) && (
        <div className="data-chips">
          {temp && <Chip k="Temp" v={temp} num />}
          {rcf && <Chip k="Spin" v={rcf} num />}
          {duration && <Chip k="Within" v={duration} num />}
        </div>
      )}

      {/* either / or — choose the path, run only the chosen one */}
      {hasAlternatives(step) && (
        <div className="block">
          <div className="block-label">Choose your method</div>
          <div className="segmented alt-switch" role="group" aria-label="alternatives">
            {step.alternatives.map((alt, i) => (
              <button key={i} aria-pressed={i === altIndex} onClick={() => onPickAlt(i)}>
                {shortLabel(stepText(alt, lang))}
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
              <Badge tone="accent">resolved</Badge>
              <span>{localize(c, 'then', lang)}</span>
            </div>
          ))}
        </div>
      )}

      {/* unresolved branch — ask inline so the run never stalls silently */}
      {selected.length === 0 && undecided.length > 0 && (
        <div className="block">
          <InlineBranch conditionals={undecided} onAnswerInline={onAnswerInline} lang={lang} />
        </div>
      )}

      {/* reagents + volumes */}
      {reagents.length > 0 && (
        <div className="block">
          <div className="block-label">Reagents</div>
          {reagents.map((r, i) => (
            <div className={`reagent-row${r.state === 'selected' ? ' selected' : ''}`} key={i}>
              <span className="r-name">{reagentName(r, lang)}</span>
              {r.condition && r.state !== 'selected' && <span className="r-cond">{reagentCondition(r, lang)}</span>}
              {r.volume && <span className="r-vol num">{reagentVolume(r, lang)}</span>}
            </div>
          ))}
        </div>
      )}

      {/* repeat loop tracker */}
      {showRepeat && (
        <div className="block">
          <div className="repeat-tracker">
            {!openEnded && repTarget <= 12 && (
              <div className="repeat-dots" aria-hidden="true">
                {Array.from({ length: repTarget }).map((_, i) => (
                  <span className={`dot${i < passes ? ' done' : ''}`} key={i} />
                ))}
              </div>
            )}
            {!openEnded && repTarget > 12 && <div className="repeat-count">×{repTarget}</div>}
            <div className="repeat-info">
              {openEnded
                ? `Repeat ${localize(eff.repeat, 'reason', lang) ? '— ' + localize(eff.repeat, 'reason', lang) : ''} · pass ${passes}`
                : eff.action === 'thermocycle'
                  ? `Cycle ${Math.min(passes, repTarget)} of ${repTarget}`
                  : `Pass ${Math.min(passes, repTarget)} of ${repTarget}`}
            </div>
            <Button variant="secondary" size="sm" onClick={onPass}>
              {openEnded || passes < repTarget ? '+ Count a pass' : '✓ Done'}
            </Button>
          </div>
        </div>
      )}

      {/* timer control strip (clock shared with the animation) */}
      {timed && (
        <div className="block">
          <TimerControls
            remaining={countdown.remaining} running={countdown.running} done={countdown.done}
            start={countdown.start} pause={countdown.pause} reset={countdown.reset} spin={eff.spin}
          />
        </div>
      )}

      {/* hazards — negatives rendered as critical alerts */}
      {hazards.length > 0 && (
        <div className="block">
          {hazards.map((h, i) => {
            const critical = isCriticalHazard(h) || isCriticalHazard((eff.hazards || [])[i])
            return (
              <Alert key={i} tone={critical ? 'hazard' : 'warn'} critical={critical}>{h}</Alert>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InlineBranch({ conditionals, onAnswerInline, lang = 'en' }) {
  const text = conditionals.map((c) => c.condition).join(' ').toLowerCase()
  const isKit = text.includes('mini') || text.includes('micro')
  const isCells = text.includes('≤') || text.includes('>') || text.includes('komórek') || text.includes('cells')

  return (
    <div className="decide">
      <div className="resolved">
        <Badge tone="info">decide</Badge>
        <span>This step depends on an unanswered question.</span>
      </div>
      {isCells && (
        <div className="seg">
          <Button variant="secondary" size="sm" onClick={() => onAnswerInline('cells', 'le')}>≤ 5×10⁶ cells</Button>
          <Button variant="secondary" size="sm" onClick={() => onAnswerInline('cells', 'gt')}>&gt; 5×10⁶ cells</Button>
        </div>
      )}
      {isKit && (
        <div className="seg">
          <Button variant="secondary" size="sm" onClick={() => onAnswerInline('kit', 'mini')}>Mini</Button>
          <Button variant="secondary" size="sm" onClick={() => onAnswerInline('kit', 'micro')}>Micro</Button>
        </div>
      )}
      {!isCells && !isKit && (
        <div className="seg">
          {conditionals.map((c, i) => (
            <span key={i} className="r-cond">{localize(c, 'condition', lang)} → {localize(c, 'then', lang)}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function shortLabel(text) {
  if (!text) return 'Option'
  const words = text.split(/\s+/).slice(0, 4).join(' ')
  return words.length < text.length ? words + '…' : words
}
