import { useEffect, useState } from 'react'
import { summarize, timelineRows, toMarkdown, toJSON, formatClock, formatDate } from '../lib/runLog.js'
import { Button } from '../ui/primitives.jsx'

// The Run record — a real deliverable, reachable during and after the run. Chronological
// timeline (notes visually distinct, deviations called out up top), plus Markdown/JSON
// export that pastes straight into an ELN. All formatting comes from the pure runLog lib.
export default function RunRecord({ open, events = [], meta = {}, onClose, onClear }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const s = summarize(events, meta)
  const rows = timelineRows(events)
  const slug = (s.protocol || 'run').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'run'

  const download = (text, name, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const copyMd = async () => {
    try { await navigator.clipboard.writeText(toMarkdown(events, meta)); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked */ }
  }

  return (
    <>
      <div className="rr-scrim" onClick={onClose} />
      <div className="run-record" role="dialog" aria-label="Run record">
        <header className="rr-head">
          <div>
            <h2 className="rr-title">Run record</h2>
            <p className="rr-note">A record of one run — not a certified audit trail.</p>
          </div>
          <button className="rr-x" type="button" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="rr-scroll">
          <div className="rr-meta">
            <div><span className="rr-k">Protocol</span><span className="rr-v">{s.protocol}</span></div>
            <div><span className="rr-k">Date</span><span className="rr-v num">{formatDate(s.startedAt)}</span></div>
            <div><span className="rr-k">Started</span><span className="rr-v num">{formatClock(s.startedAt)}</span></div>
            <div><span className="rr-k">Status</span><span className="rr-v">{s.status}</span></div>
          </div>

          {s.deviations.length > 0 && (
            <div className="rr-devs">
              <div className="rr-devs-title">⚠️ Deviations</div>
              <ul>{s.deviations.map((d, i) => <li key={i}>{d.message}</li>)}</ul>
            </div>
          )}

          {s.intake.length > 0 && (
            <div className="rr-block">
              <div className="rr-sec">Parameters of this run</div>
              {s.intake.map((e, i) => (
                <div className="rr-param" key={i}><span>{e.label || e.key}</span><strong>{e.valueLabel || e.value}</strong></div>
              ))}
            </div>
          )}

          <div className="rr-block">
            <div className="rr-sec">Timeline</div>
            <ol className="rr-timeline">
              {rows.length === 0 && <li className="rr-empty">Nothing recorded yet.</li>}
              {rows.map((r, i) => (
                <li key={i} className={`rr-row rr-${r.kind}`}>
                  <span className="rr-time num">{formatClock(r.at)}</span>
                  <span className="rr-rstep num">{r.step != null ? `#${r.step}` : ''}</span>
                  <span className="rr-text">{r.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <footer className="rr-foot">
          <Button variant="primary" size="sm" onClick={copyMd}>{copied ? 'Copied ✓' : 'Copy Markdown'}</Button>
          <Button variant="secondary" size="sm" onClick={() => download(toMarkdown(events, meta), `run-record-${slug}.md`, 'text/markdown')}>Download .md</Button>
          <Button variant="secondary" size="sm" onClick={() => download(toJSON(events, meta), `run-record-${slug}.json`, 'application/json')}>.json</Button>
          <span className="rr-spacer" />
          {onClear && (
            <Button variant="ghost" size="sm" onClick={() => { if (window.confirm('Clear this run log? This cannot be undone.')) onClear() }}>Clear log</Button>
          )}
        </footer>
      </div>
    </>
  )
}
