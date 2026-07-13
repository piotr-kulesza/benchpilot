import { Suspense, lazy, useEffect, useState } from 'react'

// The live bench, on the front door. It is the real StationScene — the same thing the
// runner shows — idling: gentle camera drift, glass catching the light. Lazy-loaded and
// behind the protocol fetch, so the rest of Home (drop / paste / examples) is interactive
// immediately and this streams in behind a calm placeholder. WebGL fallback is inherited
// from StationView: no GPU → a still, never a blank.
const StationView = lazy(() => import('../vessel/StationView.jsx'))

// A step that rests as a lit vessel + instrument (no timer, so the scene settles and just
// breathes). Index into the bundled RNA protocol.
const HERO_STEP = 4

export default function HomeHero() {
  const [protocol, setProtocol] = useState(null)

  useEffect(() => {
    let alive = true
    fetch('parsed.json').then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (alive) setProtocol(p) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  return (
    <div className="hero-scene" aria-hidden="true">
      <div className="hero-scene-frame">
        {protocol ? (
          <Suspense fallback={<div className="hero-scene-holder" />}>
            <StationView protocol={protocol} activeIndex={HERO_STEP} chromeless />
          </Suspense>
        ) : (
          <div className="hero-scene-holder" />
        )}
      </div>
    </div>
  )
}
