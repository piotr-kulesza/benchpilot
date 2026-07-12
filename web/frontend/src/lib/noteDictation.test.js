import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createNoteSession, isScratch, isSaveNote, CONFIRM_MS, SAVED_FLASH_MS } from './noteDictation.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function mk(over = {}) {
  const onCommit = vi.fn(); const onDiscard = vi.fn(); const onChange = vi.fn()
  return { s: createNoteSession({ onCommit, onDiscard, onChange, ...over }), onCommit, onDiscard, onChange }
}

describe('note dictation — flow', () => {
  it('empty seed waits in dictating; interim streams into the live caret', () => {
    const { s, onChange } = mk()
    s.begin({ step: 8, stepTitle: 'Transfer' })
    expect(s.state).toMatchObject({ phase: 'dictating', text: '', step: 8, stepTitle: 'Transfer' })
    s.interim('the pellet looked')
    expect(s.state).toMatchObject({ phase: 'dictating', live: 'the pellet looked' })
    expect(onChange).toHaveBeenCalled()
  })

  it('a finalised utterance appends and moves to confirming', () => {
    const { s } = mk()
    s.begin({ step: 8 })
    s.append('the pellet looked loose')
    expect(s.state).toMatchObject({ phase: 'confirming', text: 'the pellet looked loose', live: '' })
  })

  it('a seed ("note: …") lands straight in confirming', () => {
    const { s } = mk()
    s.begin({ step: 3, seed: 'RNA looked degraded' })
    expect(s.state).toMatchObject({ phase: 'confirming', text: 'RNA looked degraded' })
  })

  it('untouched, it auto-commits after the beat and flashes committed, then clears', () => {
    const { s, onCommit } = mk()
    s.begin({ step: 8, stepTitle: 'Transfer', seed: 'cloudy supernatant' })
    vi.advanceTimersByTime(CONFIRM_MS - 1)
    expect(onCommit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onCommit).toHaveBeenCalledWith('cloudy supernatant', { step: 8, stepTitle: 'Transfer' })
    expect(s.phase).toBe('committed') // "Saved" flash
    vi.advanceTimersByTime(SAVED_FLASH_MS)
    expect(s.phase).toBe('idle')
  })

  it('resuming speech (interim) cancels the auto-commit', () => {
    const { s, onCommit } = mk()
    s.begin({ step: 8, seed: 'first sentence' })
    vi.advanceTimersByTime(CONFIRM_MS - 500)
    s.interim('second') // still talking
    vi.advanceTimersByTime(CONFIRM_MS)
    expect(onCommit).not.toHaveBeenCalled()
    expect(s.phase).toBe('dictating')
    s.append('second sentence')
    expect(s.state.text).toBe('first sentence second sentence')
  })

  it('a hand edit stops the auto-commit beat', () => {
    const { s, onCommit } = mk()
    s.begin({ step: 8, seed: 'typo here' })
    s.edit('fixed here')
    vi.advanceTimersByTime(CONFIRM_MS * 2)
    expect(onCommit).not.toHaveBeenCalled() // waits for an explicit commit
    s.commit()
    expect(onCommit).toHaveBeenCalledWith('fixed here', expect.anything())
  })

  it('discard throws it away, saving nothing', () => {
    const { s, onCommit, onDiscard } = mk()
    s.begin({ step: 8, seed: 'never mind this' })
    s.discard()
    expect(onDiscard).toHaveBeenCalledOnce()
    expect(onCommit).not.toHaveBeenCalled()
    expect(s.phase).toBe('idle')
  })

  it('never saves a blank note — commit on empty discards instead', () => {
    const { s, onCommit, onDiscard } = mk()
    s.begin({ step: 8 })      // empty
    s.commit()
    expect(onCommit).not.toHaveBeenCalled()
    expect(onDiscard).toHaveBeenCalled()
    expect(s.phase).toBe('idle')
  })
})

describe('spoken end-of-dictation controls', () => {
  it('isScratch matches discards, not note content', () => {
    for (const t of ['scratch that', 'cancel', 'discard that', 'never mind', 'delete that']) expect(isScratch(t)).toBe(true)
    expect(isScratch('the pellet looked loose')).toBe(false)
    expect(isScratch('scratched the surface of the agar')).toBe(false)
  })
  it('isSaveNote matches commits, not note content', () => {
    for (const t of ['save', 'save it', 'keep it', "that's it", 'done', 'log it']) expect(isSaveNote(t)).toBe(true)
    expect(isSaveNote('the sample was saved from contamination')).toBe(false)
  })
})
