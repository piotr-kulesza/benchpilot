// <StationView> — the persistent 3D hero for the runner, filling the right pane.
// WebGL is feature-detected; without it (or if the live scene throws) we fall back
// to a calm static <Fallback>. NOTHING floats over the scene — the pane is pure 3D.
// All step data lives in the left column.

import { Component, useEffect, useMemo, useState } from 'react'
import './vessel.css'
import Fallback from './Fallback.jsx'
import StationCanvas from './StationCanvas.jsx'
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

// The in-world labels bake their text into a canvas texture; a canvas `font` string
// does NOT wait for the CSS webfont, so drawing before the face has loaded freezes
// the labels in the fallback face. Gate the 3D mount until the label faces are ready
// (the DOM keeps showing the static fallback for the ~few ms this takes).
const LABEL_FACES = ["500 42px 'IBM Plex Sans'", "400 42px 'IBM Plex Sans'", "500 26px 'IBM Plex Mono'"]
function labelFontsLoaded() {
  try { return LABEL_FACES.every((f) => document.fonts.check(f)) } catch { return true }
}

export default function StationView({ protocol, activeIndex = 0, answers = {}, lang = 'en', progress = 1, running = false, hasTimer = false, done = false, altByStep = {}, chromeless = false }) {
  const [use3D] = useState(() => webglAvailable())
  const [fontsReady, setFontsReady] = useState(labelFontsLoaded)

  useEffect(() => {
    if (fontsReady) return undefined
    let alive = true
    Promise.all(LABEL_FACES.map((f) => document.fonts.load(f)))
      .then(() => document.fonts.ready)
      .then(() => { if (alive) setFontsReady(true) })
      .catch(() => { if (alive) setFontsReady(true) }) // never trap the scene behind a font error
    return () => { alive = false }
  }, [fontsReady])

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
        {use3D && fontsReady ? (
          <GLBoundary fallback={fallback}>
            <StationCanvas
              protocol={protocol} activeIndex={activeIndex} answers={answers} lang={lang}
              progress={progress} running={running} hasTimer={hasTimer} done={done}
              altByStep={altByStep} chromeless={chromeless}
            />
          </GLBoundary>
        ) : fallback}
      </div>
    </div>
  )
}
