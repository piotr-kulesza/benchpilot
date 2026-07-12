import { useRef, useState } from 'react'
import { Button, Card, Panel, Textarea, Alert, Badge } from '../ui/primitives.jsx'

// The service front door: what it is → bring your own (drop / paste) as the primary
// action → or pick a pre-parsed example. The example cards are the argument that it
// generalises — each surfaces the distinctive equipment it renders.
export default function Home({ examples, onPickExample, onParse, parseState }) {
  const [text, setText] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)
  const busy = parseState?.status === 'loading'

  const chooseFile = (file) => { if (file) onParse({ file }) }
  const onDrop = (e) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files && e.dataTransfer.files[0]
    if (f) chooseFile(f)
  }

  return (
    <div className="home">
      <header className="home-hero">
        <div className="brand"><span className="dot" /> benchpilot</div>
        <h1>Paste a messy lab protocol → a runnable, timed, gap-flagged 3D walkthrough you can follow at the bench.</h1>
        <p className="home-sub">
          Protocols are written to be archived, not to be followed. benchpilot turns the prose
          into a run — live timers, hazards up front, the missing numbers asked about before
          you start, and one sample moving through the real glassware.
        </p>
      </header>

      <Panel title="Bring your own" sub="Drop a file or paste the text. Usually ready in 10–20 s.">
        <div className="upload-grid">
          <div
            className={`filedrop${drag ? ' drag' : ''}${busy ? ' disabled' : ''}`}
            role="button" tabIndex={0}
            onClick={() => !busy && fileRef.current && fileRef.current.click()}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); fileRef.current?.click() } }}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => !busy && onDrop(e)}
          >
            <input ref={fileRef} type="file" accept=".docx,.txt,.md,text/plain" hidden
              onChange={(e) => chooseFile(e.target.files && e.target.files[0])} />
            <div className="filedrop-icon" aria-hidden="true">⤓</div>
            <div className="filedrop-main">Drop a <b>.docx</b> / <b>.txt</b> / <b>.md</b></div>
            <div className="filedrop-sub">or click to choose a file</div>
          </div>
          <div className="paste-box">
            <Textarea value={text} disabled={busy} aria-label="Paste protocol text"
              onChange={(e) => setText(e.target.value)}
              placeholder="…or paste the protocol text" />
            <Button variant="primary" disabled={busy || !text.trim()} onClick={() => onParse({ text })}>
              {busy ? 'Reading…' : 'Build the run'}
            </Button>
          </div>
        </div>
        {busy && (
          <div className="state inline"><span className="spinner" aria-hidden="true" />
            <span>Reading your protocol… usually 10–20&nbsp;s.</span></div>
        )}
        {parseState?.status === 'error' && (
          <Alert tone="warn">{parseState.message} The examples below still run.</Alert>
        )}
      </Panel>

      <Panel title="Or run an example" sub="Eight techniques benchpilot was never tuned for, plus the RNA reference. Each one runs instantly and renders its own equipment.">
        <div className="ex-grid">
          {examples.map((ex) => (
            <Card as="button" className="ex-card" key={ex.id} onClick={() => onPickExample(ex)} disabled={busy}>
              <div className="ex-name">{ex.name}</div>
              <div className="ex-tech">{ex.technique}</div>
              <div className="ex-meta">
                <span className="ex-tech"><span className="num">{ex.steps}</span> steps</span>
                <Badge tone="accent">{ex.highlight}</Badge>
              </div>
            </Card>
          ))}
        </div>
      </Panel>
    </div>
  )
}
