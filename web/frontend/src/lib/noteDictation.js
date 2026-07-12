// Dictating a note is its own MODE — a permanent record being authored, not a transient
// command. This is the pure state machine behind it, so it unit-tests offline with canned
// transcripts + fake timers (no mic, no React):
//
//   idle ──begin──► dictating ──append(final)──► confirming ──commit──► committed ──► idle
//                        ▲                            │  └──discard──► idle
//                        └────── interim (resumed) ───┘
//
//   begin({step, stepTitle, seed})  enter the mode. A seed (from "note: …") lands straight
//                                   in confirming; an empty seed ("make a note") waits.
//   interim(text)   the in-progress words stream into `live` (the live caret).
//   append(final)   a finalised utterance is appended to the note → confirming (a beat then
//                   auto-commits, unless touched).
//   edit(text)      hand edit — cancels the auto-commit beat.
//   commit()        lands the note (onCommit) and flashes `committed`; blank → discarded.
//   discard()       throws it away (onDiscard); nothing is saved.

export const CONFIRM_MS = 5000 // beat before an untouched note auto-commits
export const SAVED_FLASH_MS = 1800 // how long the "Saved" flash shows before it clears

export function createNoteSession({ confirmMs = CONFIRM_MS, savedMs = SAVED_FLASH_MS, onChange, onCommit, onDiscard } = {}) {
  let phase = 'idle' // 'idle' | 'dictating' | 'confirming' | 'committed'
  let text = ''
  let live = ''
  let step = null
  let stepTitle = ''
  let timer = null

  const clearTimer = () => { if (timer != null) { clearTimeout(timer); timer = null } }
  const emit = () => onChange && onChange({ phase, text, live, step, stepTitle })
  const toConfirm = () => { phase = 'confirming'; clearTimer(); if (text.trim()) timer = setTimeout(commit, confirmMs) }

  function begin(meta = {}) {
    step = meta.step ?? null
    stepTitle = meta.stepTitle || ''
    text = String(meta.seed || '').trim()
    live = ''
    if (text) toConfirm(); else { phase = 'dictating'; clearTimer() }
    emit()
  }
  function interim(t) {
    if (phase === 'idle' || phase === 'committed') return
    live = String(t || '')
    if (phase === 'confirming') { phase = 'dictating'; clearTimer() } // they resumed speaking
    emit()
  }
  function append(t) {
    if (phase === 'idle' || phase === 'committed') return
    const chunk = String(t || '').trim()
    if (chunk) text = text ? `${text} ${chunk}` : chunk
    live = ''
    toConfirm()
    emit()
  }
  function edit(t) {
    if (phase === 'idle' || phase === 'committed') return
    text = String(t || '')
    phase = 'confirming'
    clearTimer() // a hand edit means the user is in control — don't auto-commit under them
    emit()
  }
  function commit() {
    const out = text.trim()
    clearTimer()
    if (!out) return discard() // never save a blank note
    if (onCommit) onCommit(out, { step, stepTitle })
    phase = 'committed' // brief "Saved" flash so the user SEES it land
    live = ''
    emit()
    timer = setTimeout(() => { phase = 'idle'; text = ''; emit() }, savedMs)
    return out
  }
  function discard() {
    clearTimer()
    const was = phase === 'dictating' || phase === 'confirming'
    phase = 'idle'; text = ''; live = ''
    emit()
    if (was && onDiscard) onDiscard()
    return null
  }

  return {
    get phase() { return phase },
    get state() { return { phase, text, live, step, stepTitle } },
    begin, interim, append, edit, commit, discard,
    destroy: clearTimer,
  }
}

// spoken controls that end a dictation — distinct from real commands
const SCRATCH_RE = /^(?:scratch that|scratch it|cancel(?:\s+that|\s+the note)?|discard(?:\s+that|\s+the note)?|delete that|never mind|forget it|nvm)\b/i
const SAVE_RE = /^(?:save(?:\s+(?:it|the note|that))?|keep(?:\s+it|\s+that)?|that'?s it|done|commit|log it)\b/i
export function isScratch(t) { return SCRATCH_RE.test(String(t || '').trim()) }
export function isSaveNote(t) { return SAVE_RE.test(String(t || '').trim()) }
