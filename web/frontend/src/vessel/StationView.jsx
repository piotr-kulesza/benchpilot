// <StationView> — the persistent hero for the runner: the whole protocol as a 3D
// station line, framed on the active step. Mounted ONCE (above the keyed step
// card) so the sample and camera travel as you go Back/Next instead of the canvas
// remounting each step.
//
// Robust by construction: WebGL is feature-detected; without it (or before the 3D
// chunk loads) we show the static <Fallback>. If the live scene throws, the error
// boundary swaps in the same fallback rather than crashing the runner.

import { Component, useMemo, useState } from 'react'
import './vessel.css'
import Fallback from './Fallback.jsx'
import StationCanvas from './StationCanvas.jsx'
import { reagentColor } from './theme.js'
import { resolveRecipe } from './sceneRecipe.js'
import { reagentName } from '../lib/runtime.js'

class GLBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

let _webgl
function webglAvailable() {
  if (_webgl !== undefined) return _webgl
  try {
    const c = document.createElement('canvas')
    _webgl = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    _webgl = false
  }
  return _webgl
}

function primaryReagent(reagents = []) {
  if (!reagents.length) return null
  return reagents.find((r) => r.volume) || reagents[0]
}

export default function StationView({ protocol, activeIndex = 0, answers = {}, lang = 'en', progress = 1, running = false, temp = null }) {
  const [view, setView] = useState('cinematic')
  const [use3D] = useState(() => webglAvailable())

  const steps = protocol?.steps || []
  const step = steps[Math.max(0, Math.min(activeIndex, steps.length - 1))] || { action: 'generic', reagents: [] }
  const recipe = useMemo(() => resolveRecipe(step.action), [step.action])

  const primary = primaryReagent(step.reagents)
  const name = primary ? reagentName(primary, lang) : null
  const liquidColor = useMemo(() => reagentColor(name), [name])
  const volume = primary?.volume || null
  const spin = step.spin
  const rcf = spin?.rcf_min ? `≥ ${spin.rcf_min.toLocaleString()} ×g` : null
  const spinTime = spin?.duration_seconds ? `${spin.duration_seconds}s` : null

  return (
    <div className="vessel" data-action={step.action}>
      <div className="vessel-stage station-stage">
        {use3D ? (
          <GLBoundary fallback={<Fallback liquidColor={liquidColor} fill={recipe.anim.fill} />}>
            <StationCanvas
              protocol={protocol}
              activeIndex={activeIndex}
              answers={answers}
              lang={lang}
              progress={progress}
              running={running}
              view={view}
            />
          </GLBoundary>
        ) : (
          <Fallback liquidColor={liquidColor} fill={recipe.anim.fill} />
        )}

        {/* camera toggle — cinematic dolly vs isometric pan (matches the demo) */}
        {use3D && (
          <div className="cam-toggle" role="group" aria-label="camera view">
            <button aria-pressed={view === 'cinematic'} onClick={() => setView('cinematic')}>
              Cinematic
            </button>
            <button aria-pressed={view === 'isometric'} onClick={() => setView('isometric')}>
              Isometric
            </button>
          </div>
        )}

        {/* data overlay — the parse data stays visible beside the scene */}
        <div className="vessel-overlay">
          {name && (
            <div className="ov-chip reagent">
              <span className="ov-name">{name}</span>
              {volume && <span className="ov-vol">{volume}</span>}
            </div>
          )}
          {temp && <div className="ov-chip temp">🌡 {temp}</div>}
          {(rcf || spinTime) && (
            <div className="ov-chip spin">
              {rcf}
              {rcf && spinTime ? ' · ' : ''}
              {spinTime}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
