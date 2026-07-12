// The benchpilot wordmark — one shared mark so the brand reads the same everywhere.
// Two-tone (bench = ink / current colour, pilot = accent) with a glowing accent dot that
// scales with the type. Sizing lives in CSS (.wordmark font-size); wrappers can bump it.
export default function BrandWord() {
  return (
    <span className="wordmark">
      <span className="wordmark-dot" aria-hidden="true" />
      <span className="wordmark-text">bench<span className="wordmark-accent">pilot</span></span>
    </span>
  )
}
