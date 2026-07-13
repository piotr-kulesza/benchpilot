import { describe, it, expect, vi } from 'vitest'
import { dispatchIntent } from './voiceDispatch.js'

const mkControls = () => ({
  next: vi.fn(), back: vi.fn(), goto: vi.fn(),
  startTimer: vi.fn(), pauseTimer: vi.fn(), resetTimer: vi.fn(),
  countPass: vi.fn(), chooseAlternative: vi.fn(), answerQuestion: vi.fn(), addNote: vi.fn(),
})

describe('dispatchIntent — navigation', () => {
  it('next advances', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'next', confidence: 1 }, c, { stepIndex: 2, stepCount: 24 })
    expect(c.next).toHaveBeenCalledOnce()
    expect(r).toMatchObject({ ok: true, cue: 'accepted' })
  })
  it('back at the first step is refused (nothing to go back to)', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'back', confidence: 1 }, c, { stepIndex: 0, stepCount: 24 })
    expect(c.back).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: false, cue: 'rejected' })
  })
  it('goto honours a valid 1-based step number', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'goto', args: { step: 12 }, confidence: 0.9 }, c, { stepCount: 24 })
    expect(c.goto).toHaveBeenCalledWith(11)
    expect(r.ok).toBe(true)
  })
  it('goto out of range is refused, not clamped silently', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'goto', args: { step: 99 }, confidence: 0.9 }, c, { stepCount: 24 })
    expect(c.goto).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })
})

describe('dispatchIntent — timer', () => {
  const timed = { hasTimer: true, running: false, remaining: 15 }
  it('start starts and asks for the distinct timerStart cue', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'start_timer', confidence: 1 }, c, timed)
    expect(c.startTimer).toHaveBeenCalledOnce()
    expect(r.cue).toBe('timerStart')
  })
  it('start on a step with no timer is refused', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'start_timer', confidence: 1 }, c, { hasTimer: false })
    expect(c.startTimer).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })
  it('pause a running timer pauses', () => {
    const c = mkControls()
    dispatchIntent({ action: 'pause_timer', confidence: 1 }, c, { hasTimer: true, running: true })
    expect(c.pauseTimer).toHaveBeenCalledOnce()
  })
  it('time_remaining is read-only and SPEAKS natural language (not "1m 35s")', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'time_remaining', confidence: 1 }, c, { hasTimer: true, remaining: 95 })
    expect(r).toMatchObject({ ok: true, message: '1 minute 35 seconds remaining', speak: '1 minute 35 seconds remaining' })
    expect(Object.values(c).every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })
})

describe('dispatchIntent — a running timer is sacred', () => {
  it('reset while running needs a spoken confirmation first (no wipe)', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'reset_timer', confidence: 1 }, c, { hasTimer: true, running: true })
    expect(c.resetTimer).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: false, needsConfirm: true, cue: 'confirm' })
  })
  it('reset while running goes through once confirmed', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'reset_timer', confidence: 1 }, c, { hasTimer: true, running: true }, { confirmed: true })
    expect(c.resetTimer).toHaveBeenCalledOnce()
    expect(r.ok).toBe(true)
  })
  it('reset a paused timer needs no confirmation', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'reset_timer', confidence: 1 }, c, { hasTimer: true, running: false })
    expect(c.resetTimer).toHaveBeenCalledOnce()
    expect(r.ok).toBe(true)
  })
})

describe('dispatchIntent — ambiguity does not act', () => {
  it('unknown plays the distinct reject cue and touches nothing', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'unknown', confidence: 0 }, c, {})
    expect(r).toMatchObject({ ok: false, cue: 'rejected' })
    expect(Object.values(c).every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })
  it('low confidence is refused even for a known action', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'next', confidence: 0.3 }, c, { stepIndex: 1, stepCount: 24 })
    expect(c.next).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })
  it('idle (not addressed) is a silent no-op — no cue at all', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'idle' }, c, {})
    expect(r.cue).toBeNull()
  })
})

describe('dispatchIntent — passes, alternatives, answers', () => {
  it('count_pass and repeat_step both log a pass', () => {
    const c = mkControls()
    dispatchIntent({ action: 'count_pass', confidence: 1 }, c, {})
    dispatchIntent({ action: 'repeat_step', confidence: 1 }, c, {})
    expect(c.countPass).toHaveBeenCalledTimes(2)
  })
  it('choose_alternative resolves a fuzzy label to an index', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'choose_alternative', args: { label: 'micro' }, confidence: 0.9 },
      c, { alternatives: ['Mini kit', 'Micro kit'] })
    expect(c.chooseAlternative).toHaveBeenCalledWith(1)
    expect(r.ok).toBe(true)
  })
  it('choose_alternative with no match is refused', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'choose_alternative', args: { label: 'plasma torch' }, confidence: 0.9 },
      c, { alternatives: ['Mini kit', 'Micro kit'] })
    expect(c.chooseAlternative).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })
  it('answer_question passes key/value to the same inline-answer control', () => {
    const c = mkControls()
    dispatchIntent({ action: 'answer_question', args: { key: 'cells', value: 'le' }, confidence: 0.9 }, c, {})
    expect(c.answerQuestion).toHaveBeenCalledWith('cells', 'le')
  })
  it('add_note records the spoken text; an empty note is refused', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'add_note', args: { text: 'pellet looked loose' }, confidence: 1 }, c, {})
    expect(c.addNote).toHaveBeenCalledWith('pellet looked loose')
    expect(r).toMatchObject({ ok: true, message: 'Noted: “pellet looked loose”' })
    const c2 = mkControls()
    const r2 = dispatchIntent({ action: 'add_note', args: { text: '  ' }, confidence: 1 }, c2, {})
    expect(c2.addNote).not.toHaveBeenCalled()
    expect(r2.ok).toBe(false)
  })
})

describe('dispatchIntent — the app SPEAKS what it knows (answers)', () => {
  it('answer relays Claude\'s text to be SPOKEN, marks it kind:answer, and never acts', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'answer', args: { text: 'You added RW1 buffer three steps ago.' }, confidence: 0.9 }, c, {})
    expect(r).toMatchObject({ ok: true, speak: 'You added RW1 buffer three steps ago.', kind: 'answer', cue: null })
    expect(Object.values(c).every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })
  it('"the protocol doesn\'t say" is a first-class SPOKEN answer, not a rejection', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'answer', args: { text: "The protocol doesn't say." }, confidence: 0.9 }, c, {})
    expect(r).toMatchObject({ ok: true, kind: 'answer', speak: "The protocol doesn't say." })
  })
  it('a low-confidence QUESTION still answers — the gate only guards state changes', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'answer', args: { text: 'Two spins remain.' }, confidence: 0.3 }, c, {})
    expect(r).toMatchObject({ ok: true, kind: 'answer' }) // read-only → not gated out
  })
  it('steps_remaining counts across the protocol and speaks it', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'steps_remaining', confidence: 1 }, c, { stepIndex: 5, stepCount: 26 })
    expect(r).toMatchObject({ ok: true, speak: '20 steps to go.', kind: 'answer' })
    const last = dispatchIntent({ action: 'steps_remaining', confidence: 1 }, mkControls(), { stepIndex: 25, stepCount: 26 })
    expect(last.speak).toBe('This is the last step.')
  })
})

describe('dispatchIntent — skip and cancel', () => {
  it('skip_step advances via the SAME next control (one source of truth)', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'skip_step', confidence: 1 }, c, { stepIndex: 3, stepCount: 26 })
    expect(c.next).toHaveBeenCalledOnce()
    expect(r).toMatchObject({ ok: true, message: 'Skipped' })
  })
  it('cancel stands down silently — no cue, nothing touched', () => {
    const c = mkControls()
    const r = dispatchIntent({ action: 'cancel', confidence: 1 }, c, {})
    expect(r.cue).toBeNull()
    expect(Object.values(c).every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })
})
