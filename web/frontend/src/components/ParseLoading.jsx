import BrandWord from '../ui/BrandWord.jsx'

// The full-screen "reading your protocol" state. Honest: NO fake ETA, NO progress bar
// measuring nothing — an indeterminate, calm animation of the actual work. The left card
// shows messy PROSE; a scan sweeps it and the right card resolves into a structured RUN
// (numbered steps, a timer, a hazard) — the product's whole thesis, in motion.
export default function ParseLoading() {
  return (
    <div className="parse-loading" role="status" aria-live="polite">
      <div className="pl-inner">
        <BrandWord />

        <div className="pl-stage" aria-hidden="true">
          {/* messy prose being read */}
          <div className="pl-card pl-prose">
            <span className="pl-scan" />
            {[82, 96, 70, 90, 60, 88, 74].map((w, i) => (
              <span key={i} className="pl-line" style={{ width: `${w}%` }} />
            ))}
          </div>
          <span className="pl-arrow">→</span>
          {/* resolving into a runnable structure */}
          <div className="pl-card pl-run">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="pl-step" style={{ animationDelay: `${0.5 + i * 0.28}s` }}>
                <span className="pl-dot" />
                <span className="pl-bar" style={{ width: `${64 + ((i * 37) % 30)}%` }} />
              </span>
            ))}
          </div>
        </div>

        <div className="pl-copy">
          <h1 className="pl-title">Reading your protocol…</h1>
        </div>
      </div>
    </div>
  )
}
