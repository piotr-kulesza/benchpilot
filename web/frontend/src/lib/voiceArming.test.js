import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createArming, isCancel, ARM_MS, FOLLOWUP_MS } from './voiceArming.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function mk() {
  const onArm = vi.fn(); const onDisarm = vi.fn()
  return { a: createArming({ onArm, onDisarm }), onArm, onDisarm }
}

describe('arming', () => {
  it('wake arms and blips exactly once on the idle→armed edge', () => {
    const { a, onArm } = mk()
    expect(a.armed).toBe(false)
    a.wake()
    expect(a.armed).toBe(true)
    expect(onArm).toHaveBeenCalledOnce()
    a.wake() // already armed → extend, no second blip
    expect(onArm).toHaveBeenCalledOnce()
  })

  it('disarms silently after the window with reason "timeout" (acceptance 4)', () => {
    const { a, onDisarm } = mk()
    a.wake()
    vi.advanceTimersByTime(ARM_MS - 1)
    expect(a.armed).toBe(true)
    vi.advanceTimersByTime(1)
    expect(a.armed).toBe(false)
    expect(onDisarm).toHaveBeenCalledWith('timeout')
  })

  it('stays armed through a thinking pause, then acts (acceptance 1)', () => {
    const { a } = mk()
    a.wake()
    vi.advanceTimersByTime(3000) // "…wait three seconds, thinking…"
    expect(a.armed).toBe(true)   // still armed → "start" would be treated as a command
  })

  it('speech activity extends the window — a mid-sentence pause never disarms (acceptance 5)', () => {
    const { a, onDisarm } = mk()
    a.wake()
    vi.advanceTimersByTime(ARM_MS - 500)
    a.speech()                    // still talking
    vi.advanceTimersByTime(ARM_MS - 500)
    a.speech()
    vi.advanceTimersByTime(ARM_MS - 500)
    expect(a.armed).toBe(true)
    expect(onDisarm).not.toHaveBeenCalled()
  })

  it('after a command it holds a short follow-up window, then disarms (acceptance 3)', () => {
    const { a, onDisarm } = mk()
    a.wake()
    a.commandHandled()
    expect(a.armed).toBe(true)
    vi.advanceTimersByTime(FOLLOWUP_MS - 1)
    expect(a.armed).toBe(true)   // a follow-up spoken now would still land
    vi.advanceTimersByTime(1)
    expect(a.armed).toBe(false)
    expect(onDisarm).toHaveBeenCalledWith('timeout')
  })

  it('a follow-up that starts speaking re-extends to the full window', () => {
    const { a } = mk()
    a.wake(); a.commandHandled()
    vi.advanceTimersByTime(FOLLOWUP_MS - 100)
    a.speech()                     // follow-up begins
    vi.advanceTimersByTime(FOLLOWUP_MS + 100)
    expect(a.armed).toBe(true)     // extended past the short follow-up window
  })

  it('cancel disarms immediately with reason "cancel"', () => {
    const { a, onDisarm } = mk()
    a.wake()
    a.cancel()
    expect(a.armed).toBe(false)
    expect(onDisarm).toHaveBeenCalledWith('cancel')
  })

  it('speech/commandHandled while disarmed do nothing', () => {
    const { a, onArm } = mk()
    a.speech(); a.commandHandled()
    expect(a.armed).toBe(false)
    expect(onArm).not.toHaveBeenCalled()
  })
})

describe('isCancel', () => {
  it('matches explicit stand-downs', () => {
    for (const t of ['never mind', 'nevermind', 'cancel', 'cancel that', 'forget it', 'stop listening', 'not now']) {
      expect(isCancel(t)).toBe(true)
    }
  })
  it('does not match real commands', () => {
    for (const t of ['start', 'next', 'how long is left', 'note: cancel the reaction']) {
      expect(isCancel(t)).toBe(false)
    }
  })
})
