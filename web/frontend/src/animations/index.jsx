// ActionAnimation — the single entry point the runner uses. Picks the right
// looping scene for a step's `action` (unknown -> generic, never blank) and
// feeds it the reagent label, temperature, and the live timer for timed scenes.

import './animations.css'
import { resolveAnimation, ANIMATIONS } from './actions.jsx'
import { reagentName } from '../lib/runtime.js'

export { ANIMATIONS, resolveAnimation }

// Primary reagent to label the vessel with: the first resolved reagent that has
// a volume, else the first one.
function primaryReagent(reagents = []) {
  if (!reagents.length) return null
  return reagents.find((r) => r.volume) || reagents[0]
}

export default function ActionAnimation({
  action = 'generic',
  reagents = [],
  temp = null,
  spin = null,
  timer = null,
  lang = 'en',
}) {
  const Scene = resolveAnimation(action)
  const primary = primaryReagent(reagents)
  const volume = primary?.volume || (spin?.rcf_min ? `≥ ${spin.rcf_min.toLocaleString()} ×g` : null)
  const name = primary ? reagentName(primary, lang) : null
  const usesLabel = ['pour_add', 'pipette_mix', 'wash', 'elute'].includes(action)

  return (
    <div className="action-anim" data-action={action}>
      <div className="anim-stage">
        <Scene volume={volume} temp={temp} spin={spin} timer={timer} />
      </div>
      {usesLabel && name && (
        <div className="anim-caption">
          <span className="anim-reagent">{name}</span>
          {primary?.volume && <span className="anim-vol">{primary.volume}</span>}
        </div>
      )}
    </div>
  )
}
