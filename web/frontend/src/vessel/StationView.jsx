// <StationView> — the persistent 3D hero for the runner, filling the right pane.
// WebGL is feature-detected; without it (or if the live scene throws) we fall back
// to a calm static <Fallback>. The ONLY thing allowed to float over the scene is the
// Cinematic/Isometric view toggle — it's a control FOR the scene. All step data lives
// in the left column now.

import { Component, useMemo, useState } from 'react'
import './vessel.css'
import Fallback from './Fallback.jsx'
import StationCanvas from './StationCanvas.jsx'
import { Segmented } from '../ui/primitives.jsx'
import { reagentColor } from './theme.js'
import { resolveRecipe } from './sceneRecipe.js'
import { reagentName, effectiveStep } from '../lib/runtime.js'

class GLBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

let _webgl
function webglAvailable() {
  if (_webgl !== undefined) return _webgl
  try {
    const c = document.createElement('canvas')
    _webgl = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch { _webgl = false }
  return _webgl
}

function primaryReagent(reagents = []) {
  if (!reagents.length) return null
  return reagents.find((r) => r.volume) || reagents[0]
}

export default function StationView({ protocol, activeIndex = 0, answers = {}, lang = 'en', progress = 1, running = false, altByStep = {} }) {
  const [view, setView] = useState('cinematic')
  const [use3D] = useState(() => webglAvailable())

  const steps = protocol?.steps || []
  const baseStep = steps[Math.max(0, Math.min(activeIndex, steps.length - 1))] || { action: 'generic', reagents: [] }
  const step = effectiveStep(baseStep, altByStep[baseStep.index] || 0)
  const recipe = useMemo(() => resolveRecipe(step.action), [step.action])
  const primary = primaryReagent(step.reagents)
  const name = primary ? reagentName(primary, lang) : null
  const liquidColor = useMemo(() => reagentColor(name), [name])

  const fallback = <div className="stage-fallback"><Fallback liquidColor={liquidColor} fill={recipe.anim.fill} /></div>

  return (
    <div className="vessel">
      <div className="vessel-stage">
        {use3D ? (
          <GLBoundary fallback={fallback}>
            <StationCanvas
              protocol={protocol} activeIndex={activeIndex} answers={answers} lang={lang}
              progress={progress} running={running} view={view} altByStep={altByStep}
            />
          </GLBoundary>
        ) : fallback}

        {use3D && (
          <div className="view-toggle">
            <Segmented
              ariaLabel="Camera view" value={view} onChange={setView}
              options={[{ value: 'cinematic', label: 'Cinematic' }, { value: 'isometric', label: 'Isometric' }]}
            />
          </div>
        )}
      </div>
    </div>
  )
}
