import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/primitives.jsx'

// A small, obvious "add a note" affordance living in the step panel. Notes are the
// highest-value rows in the run log, so this stays one click away and stamps the current
// step automatically. (The spoken "benchpilot, note: …" hits the exact same onAdd.)
export default function NoteComposer({ onAdd, step }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [flash, setFlash] = useState(false)
  const ref = useRef(null)

  useEffect(() => { if (open) requestAnimationFrame(() => ref.current?.focus()) }, [open])

  const save = () => {
    const t = text.trim()
    if (!t) return
    onAdd?.(t)
    setText(''); setOpen(false); setFlash(true)
    setTimeout(() => setFlash(false), 1800)
  }
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() }
    else if (e.key === 'Escape') setOpen(false)
    e.stopPropagation() // don't let the runner's ←/→ nav fire while typing
  }

  if (!open) {
    return (
      <button className="note-add" type="button" onClick={() => setOpen(true)}>
        <span className="note-add-plus">＋</span> Add a note
        {flash && <span className="note-flash">saved ✓</span>}
      </button>
    )
  }

  return (
    <div className="note-composer">
      <textarea
        ref={ref} className="note-area" rows={2} value={text}
        placeholder={`Note on step ${step ?? '—'} — what you saw, a deviation…`}
        onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
      />
      <div className="note-composer-foot">
        <span className="note-hint">⌘↵ to save</span>
        <div className="note-actions">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!text.trim()}>Save note</Button>
        </div>
      </div>
    </div>
  )
}
