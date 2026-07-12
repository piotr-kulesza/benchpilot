// DevView — top-level for the dev harness routes (?models=1 gallery, ?matrix=1
// matrix). Reads query params, mounts the canvas full-bleed, and prints a caption
// (id · kind · intended orientation | action×container · p) so a headless auditor
// can read the intent straight off the frame.
import { lazy, Suspense } from 'react'
import { getModel, MODEL_IDS } from './registry.js'

const DevCanvas = lazy(() => import('./DevCanvas.jsx'))

function q(name, dflt) {
  const v = new URLSearchParams(window.location.search).get(name)
  return v == null ? dflt : v
}

export default function DevView() {
  const matrix = q('matrix')
  const mode = matrix ? 'matrix' : 'gallery'
  const item = q('item', MODEL_IDS[0])
  const angle = q('angle', 'front')
  const action = q('action', 'pour_add')
  const container = q('container', 'microtube')
  const from = q('from', null)
  const to = q('to', null)
  const p = parseFloat(q('p', '0.5'))
  const bare = q('bare') != null
  const model = getModel(item)

  const caption = mode === 'matrix'
    ? `${action} · ${from ? `${from}→${to || container}` : container} · p=${p.toFixed(2)}`
    : `${item} · ${model?.kind || '?'} · ${model?.orient || ''}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0c0d10' }}>
      <Suspense fallback={<div style={{ color: '#889', padding: 16 }}>loading 3D…</div>}>
        <DevCanvas mode={mode} item={item} angle={angle} action={action} container={container} from={from} to={to} p={p} bare={bare} />
      </Suspense>
      {!bare && (
        <div style={{
          position: 'fixed', left: 12, top: 10, zIndex: 5, font: "600 13px ui-monospace,Menlo,monospace",
          color: '#e8ecf2', background: 'rgba(18,22,28,0.72)', padding: '6px 12px', borderRadius: 8, letterSpacing: '0.02em',
        }}>
          <span style={{ color: '#5fb3a6' }}>{mode === 'matrix' ? 'MATRIX' : 'MODEL'}</span>&nbsp; {caption}
          {mode === 'gallery' && <span style={{ color: '#8a93a0' }}>&nbsp; · angle={angle}</span>}
        </div>
      )}
    </div>
  )
}
