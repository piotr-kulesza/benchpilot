// <Vessel> — the single hero the runner renders. One beautifully-lit 3D glass
// whose state changes per action, with the parse data overlaid beside it.
//
// Robust by construction: WebGL is feature-detected; without it (or before the
// 3D chunk loads) we show the static <Fallback>. The 3D libraries are lazy-
// loaded so the initial bundle and the offline tests never need a GPU.

import { Component, useMemo, useState } from 'react'
import './vessel.css'
import Fallback from './Fallback.jsx'
import Canvas3D from './Canvas3D.jsx'
import { theme, reagentColor } from './theme.js'
import { resolveBehavior } from './behavior.js'
import { reagentName } from '../lib/runtime.js'

// Re-exported for the action→behavior mapping test.
export { resolveBehavior, BEHAVIORS } from './behavior.js'

// If the WebGL scene throws at runtime (lost context, driver quirk), fall back to
// the static vessel rather than crashing the whole runner.
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

export default function Vessel({ action = 'generic', reagents = [], temp = null, spin = null, timer = null, lang = 'en' }) {
  const behavior = useMemo(() => resolveBehavior(action), [action])
  const primary = primaryReagent(reagents)
  const name = primary ? reagentName(primary, lang) : null
  const liquidColor = useMemo(() => reagentColor(name), [name])
  const volume = primary?.volume || null

  const progress = timer ? timer.fraction : 1
  const running = !!timer?.running
  const rcf = spin?.rcf_min ? `≥ ${spin.rcf_min.toLocaleString()} ×g` : null
  const spinTime = spin?.duration_seconds ? `${spin.duration_seconds}s` : null

  const [use3D] = useState(() => webglAvailable())

  return (
    <div className="vessel" data-action={action}>
      <div
        className="vessel-stage"
        style={{ background: `radial-gradient(120% 100% at 50% 8%, ${theme.background.top} 0%, ${theme.background.bottom} 78%)` }}
      >
        {use3D ? (
          <GLBoundary fallback={<Fallback liquidColor={liquidColor} fill={behavior.fill} />}>
            <Canvas3D behavior={behavior} liquidColor={liquidColor} progress={progress} running={running} temp={temp} />
          </GLBoundary>
        ) : (
          <Fallback liquidColor={liquidColor} fill={behavior.fill} />
        )}

        {/* data overlay — the parse data stays visible beside the vessel */}
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
