import { useEffect, useMemo, useRef, useState } from 'react'
import { createNoteSession } from '../lib/noteDictation.js'

// React glue for the pure note-dictation machine: exposes the live state + the driving
// methods (begin/interim/append/edit/commit/discard). onCommit lands the note (the run log);
// onDiscard/onCommit are also where the caller plays the cues.
export function useNoteDictation({ onCommit, onDiscard } = {}) {
  const [state, setState] = useState({ phase: 'idle', text: '', live: '', step: null, stepTitle: '' })
  const cb = useRef({ onCommit, onDiscard }); cb.current = { onCommit, onDiscard }

  const session = useMemo(() => createNoteSession({
    onChange: setState,
    onCommit: (text, meta) => cb.current.onCommit?.(text, meta),
    onDiscard: () => cb.current.onDiscard?.(),
  }), [])
  useEffect(() => () => session.destroy(), [session])

  return {
    ...state,
    active: state.phase !== 'idle',
    begin: session.begin,
    interim: session.interim,
    append: session.append,
    edit: session.edit,
    commit: session.commit,
    discard: session.discard,
  }
}
