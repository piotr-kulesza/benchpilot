import { useEffect, useRef } from 'react'
import { shortLabel } from '../lib/runtime.js'

// A numbered, labelled, clickable step rail for the runner header — a top stepper.
// One node per step (circle + short label), connected by a line, with done / now /
// upcoming states. Clicking a node jumps to it; the active node auto-scrolls into view
// so it stays usable whether there are 8 steps or 24+. Uses the app's own tokens.
export default function StepTimeline({ steps = [], current = 0, onJump }) {
  const activeRef = useRef(null)

  // keep the current node visible as you move through a long protocol
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [current])

  return (
    <div className="step-timeline">
      <div className="stl-rail" aria-label="Protocol steps">
        {steps.map((step, index) => {
          const state = index < current ? 'done' : index === current ? 'now' : 'upcoming'
          const n = index + 1
          const label = shortLabel(step)
          return (
            <button
              key={step?.index ?? index}
              ref={index === current ? activeRef : null}
              type="button"
              className={`stl-node stl-${state}`}
              aria-current={index === current ? 'step' : undefined}
              aria-label={`Step ${n}${label ? `: ${label}` : ''}`}
              onClick={() => onJump?.(index)}
            >
              <span className="stl-circle" aria-hidden="true">{state === 'done' ? '✓' : n}</span>
              <span className="stl-label">{label}</span>
            </button>
          )
        })}
      </div>
      <div className="stl-hint">Click any step to jump.</div>
    </div>
  )
}
