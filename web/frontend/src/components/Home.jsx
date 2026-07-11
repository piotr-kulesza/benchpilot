import { useRef, useState } from 'react'

// The service front door: what it is → upload/paste your own → or pick one of the
// pre-parsed examples (instant, offline). Examples are the proof it generalizes, so
// each card surfaces the distinctive equipment it will render.
export default function Home({ examples, onPickExample, onParse, parseState }) {
  const [text, setText] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)
  const busy = parseState?.status === 'loading'

  const chooseFile = (file) => { if (file) onParse({ file }) }
  const onDrop = (e) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files && e.dataTransfer.files[0]
    if (f) chooseFile(f)
  }

  return (
    <div className="home">
      <header className="home-hero">
        <div className="brand"><span className="dot" /> benchpilot<small>&nbsp;protocol player</small></div>
        <h1>Paste a messy lab protocol → a runnable, timed, gap-flagged 3D walkthrough you can follow at the bench.</h1>
        <p className="home-sub">
          Any protocol, any technique. A single Claude call turns the prose into steps, timers,
          hazards, choices and gaps — then the sample travels the real glassware. The original
          language is kept verbatim; English shows by default.
        </p>
      </header>

      <section className="home-panel">
        <h2 className="home-h2">Bring your own</h2>
        <div className="upload-row">
          <div
            className={`dropzone${drag ? ' drag' : ''}${busy ? ' disabled' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => !busy && fileRef.current && fileRef.current.click()}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) fileRef.current?.click() }}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => !busy && onDrop(e)}
          >
            <input
              ref={fileRef} type="file" accept=".docx,.txt,.md,text/plain" hidden
              onChange={(e) => chooseFile(e.target.files && e.target.files[0])}
            />
            <div className="dz-icon">⤓</div>
            <div className="dz-main">Drag a <b>.docx</b> / <b>.txt</b> / <b>.md</b> here</div>
            <div className="dz-sub">or click to choose a file</div>
          </div>
          <div className="paste-box">
            <textarea
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              placeholder="…or paste raw protocol text (any language)"
            />
            <button className="parse-btn" disabled={busy || !text.trim()} onClick={() => onParse({ text })}>
              {busy ? 'Reading…' : 'Parse protocol'}
            </button>
          </div>
        </div>
        {busy && (
          <div className="parse-status loading">Reading your protocol… one Claude call, ~10–20 s.</div>
        )}
        {parseState?.status === 'error' && (
          <div className="parse-status error">
            {parseState.message} — the examples below still work with no backend.
          </div>
        )}
      </section>

      <section className="home-panel">
        <h2 className="home-h2">Or run an example</h2>
        <p className="home-note">
          Eight techniques benchpilot was never tuned for (plus the RNA reference). Each is
          pre-parsed — instant, offline — and renders its own equipment.
        </p>
        <div className="ex-grid">
          {examples.map((ex) => (
            <button className="ex-card" key={ex.id} onClick={() => onPickExample(ex)} disabled={busy}>
              <div className="ex-name">{ex.name}</div>
              <div className="ex-tech">{ex.technique}</div>
              <div className="ex-meta">
                <span className="ex-steps">{ex.steps} steps</span>
                <span className="ex-hi">{ex.highlight}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
