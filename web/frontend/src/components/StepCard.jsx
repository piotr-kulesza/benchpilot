import TimerControls from './Timer.jsx'
import ActionAnimation from '../animations/index.jsx'
import { useCountdown } from '../hooks/useCountdown.js'
import {
  hasAlternatives,
  selectAlternative,
  resolveConditionals,
  resolveReagents,
  repeatTarget,
  isOpenEndedRepeat,
  isCriticalHazard,
  timerSeconds,
  humanDuration,
  stepText,
  stepHazards,
  reagentName,
  extractTemperature,
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

// The current step: a big animated action visual (the hero), then the English
// instruction and every structural feature the parse gives us — resolved
// conditionals, either/or choice, tracked repeats, hazards (negatives red), and
// a timer whose clock also drives the animation.
export default function StepCard({
  step,
  answers,
  altIndex,
  onPickAlt,
  passes,
  onPass,
  onAnswerInline,
  lang = 'en',
}) {
  const eff = hasAlternatives(step) ? selectAlternative(step, altIndex) : step
  const kind = eff.kind || 'action'

  const reagents = resolveReagents(eff, answers)
  const { selected, undecided } = resolveConditionals(eff, answers)
  const timed = timerSeconds(step, altIndex)
  const temp = extractTemperature(eff, lang)

  // One clock for both the timer control and the animation ring/rotor.
  const countdown = useCountdown(timed || 0)
  const timer = timed
    ? {
        remaining: countdown.remaining,
        fraction: timed > 0 ? countdown.remaining / timed : 1,
        running: countdown.running,
        done: countdown.done,
      }
    : null

  const repTarget = repeatTarget(eff)
  const openEnded = isOpenEndedRepeat(eff)
  const showRepeat = eff.repeat && (repTarget > 1 || openEnded)
  const hazards = stepHazards(eff, lang)

  return (
    <div className="step-card" key={`${step.index}-${altIndex}-${lang}`}>
      {/* HERO animation */}
      <div className="hero-anim">
        <ActionAnimation
          action={eff.action || 'generic'}
          reagents={reagents}
          temp={temp}
          spin={eff.spin}
          timer={timer}
          lang={lang}
        />
      </div>

      <span className="kind-badge" data-kind={kind}>
        <span>{KIND_ICON[kind] || '→'}</span>
        {kind}
        {eff.duration_seconds && !timed ? ` · ${humanDuration(eff.duration_seconds)}` : ''}
      </span>

      <p className="instruction">{stepText(eff, lang) || stepText(step, lang)}</p>

      {/* either / or — choose the path, run only the chosen one */}
      {hasAlternatives(step) && (
        <div className="block">
          <div className="block-label">Choose your method</div>
          <div className="alt-switch" role="group" aria-label="alternatives">
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
              <span className="r-name">{reagentName(r, lang)}</span>
              {r.condition && r.state !== 'selected' && <span className="r-cond">{r.condition}</span>}
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

      {/* timer control strip (clock shared with the animation) */}
      {timed && (
        <div className="block">
          <TimerControls
            remaining={countdown.remaining}
            running={countdown.running}
            done={countdown.done}
            start={countdown.start}
            pause={countdown.pause}
            reset={countdown.reset}
            spin={eff.spin}
          />
        </div>
      )}

      {/* hazards — negatives rendered boldly in red */}
      {hazards.length > 0 && (
        <div className="block">
          {hazards.map((h, i) => {
            const critical = isCriticalHazard(h) || isCriticalHazard((eff.hazards || [])[i])
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
  const text = conditionals.map((c) => c.condition).join(' ').toLowerCase()
  const isKit = text.includes('mini') || text.includes('micro')
  const isCells =
    text.includes('≤') || text.includes('>') || text.includes('komórek') || text.includes('cells')

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
  const words = text.split(/\s+/).slice(0, 4).join(' ')
  return words.length < text.length ? words + '…' : words
}
