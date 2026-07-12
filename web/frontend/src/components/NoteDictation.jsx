import { useEffect, useRef } from 'react'
import { Button } from '../ui/primitives.jsx'

// The note being dictated, as its OWN object in the step panel — a ruled slip that reads as
// a record being authored, not a status line. It is loudly RECORDING, the words stream in
// with a live caret, it's anchored to the step, and on commit it flashes "Saved" so the user
// SEES it land in the record. Driven entirely by the pure machine via `note`.
export default function NoteDictation({ note }) {
  const areaRef = useRef(null)
  // when it enters the confirm/edit state, focus the field so a hand edit is one tap away
  useEffect(() => {
    if (note.phase === 'confirming') requestAnimationFrame(() => areaRef.current?.focus({ preventScroll: true }))
  }, [note.phase])

  if (!note.active) return null

  const anchor = `Step ${note.step ?? '—'}${note.stepTitle ? `, ${note.stepTitle}` : ''}`
  const recording = note.phase === 'dictating'
  const confirming = note.phase === 'confirming'
  const committed = note.phase === 'committed'

  return (
    <div className={`note-dictation nd-${note.phase}`} role="group" aria-label="Dictated note">
      <header className="nd-head">
        <span className="nd-state">
          {committed
            ? <>✓ <b>Saved to the run log</b></>
            : <><span className="nd-dot" aria-hidden="true" />{recording ? 'Recording a note' : 'Review — not yet saved'}</>}
        </span>
        <span className="nd-anchor">Note · {anchor}</span>
      </header>

      {confirming ? (
        <textarea
          ref={areaRef} className="nd-field" rows={2} value={note.text}
          onChange={(e) => note.edit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation() // never let ←/→ step-nav fire while editing a note
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); note.commit() }
          }}
        />
      ) : (
        <p className="nd-stream">
          {note.text}
          {note.live && <span className="nd-live"> {note.live}</span>}
          {!committed && <span className="nd-caret" aria-hidden="true" />}
        </p>
      )}

      {confirming && (
        <div className="nd-actions">
          <span className="nd-hint">saving in a moment — or edit / “scratch that”</span>
          <div className="nd-buttons">
            <Button variant="ghost" size="sm" onClick={note.discard}>Discard</Button>
            <Button variant="primary" size="sm" onClick={note.commit} disabled={!note.text.trim()}>Save note</Button>
          </div>
        </div>
      )}
    </div>
  )
}
