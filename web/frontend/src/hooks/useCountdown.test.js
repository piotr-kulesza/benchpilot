import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCountdown } from './useCountdown.js'

// The wall-clock is the impure heart of the timer; this exercises it under FAKE timers
// (no DOM, no rAF) so we can advance across the whole duration and assert it reaches
// zero — the exact failure the runner hit (a countdown that stalled partway).
describe('createCountdown — runs to zero and never stalls', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const run = (dur) => {
    let s = { remaining: dur, running: false, done: false }
    const c = createCountdown(dur, (v) => { s = v })
    return { c, get: () => s }
  }

  it('counts from the duration to exactly 0, then done', () => {
    const { c, get } = run(15)
    c.start()
    expect(get().running).toBe(true)
    vi.advanceTimersByTime(7000)
    expect(get().remaining).toBeCloseTo(8, 5)
    expect(get().done).toBe(false)
    vi.advanceTimersByTime(8000)
    expect(get().remaining).toBe(0)
    expect(get().done).toBe(true)
    expect(get().running).toBe(false)
    c.destroy()
  })

  it('is monotonic across the full duration — no stall, no jump back up', () => {
    const { c, get } = run(15)
    c.start()
    let prev = Infinity
    for (let t = 0; t < 15000; t += 500) {
      vi.advanceTimersByTime(500)
      expect(get().remaining).toBeLessThanOrEqual(prev + 1e-9)
      prev = get().remaining
    }
    expect(get().remaining).toBe(0)
    expect(get().done).toBe(true)
    c.destroy()
  })

  it('pause freezes, resume continues from there, reset returns to full', () => {
    const { c, get } = run(15)
    c.start()
    vi.advanceTimersByTime(5000)
    expect(get().remaining).toBeCloseTo(10, 5)
    c.pause()
    const frozen = get().remaining
    expect(get().running).toBe(false)
    vi.advanceTimersByTime(5000)            // wall-clock time passes while paused
    expect(get().remaining).toBe(frozen)    // …the value does not move
    c.start()                               // resume from the frozen value
    vi.advanceTimersByTime(frozen * 1000)
    expect(get().remaining).toBe(0)
    expect(get().done).toBe(true)
    c.reset()
    expect(get().remaining).toBe(15)
    expect(get().running).toBe(false)
    expect(get().done).toBe(false)
    c.destroy()
  })

  it('a new step (setDuration) resets to the new duration and can run it out', () => {
    const { c, get } = run(15)
    c.start()
    vi.advanceTimersByTime(3000)
    c.setDuration(120)
    expect(get().remaining).toBe(120)
    expect(get().running).toBe(false)
    expect(get().done).toBe(false)
    c.start()
    vi.advanceTimersByTime(120000)
    expect(get().remaining).toBe(0)
    expect(get().done).toBe(true)
    c.destroy()
  })
})

// The 3D reads the countdown EVERY FRAME through live(), from an injectable monotonic
// clock (performance.now in the app; the capture harness pins performance.now to a
// fixed step), instead of waiting for the 10 Hz React tick. The text readout is untouched.
describe('createCountdown — live() for the frame clock', () => {
  it('advances between ticks, on the injected clock', () => {
    let t = 1000
    const c = createCountdown(10, () => {}, () => t)
    c.start()
    expect(c.live()).toBe(10)
    t += 16.7                                   // one frame, no tick yet
    expect(c.live()).toBeCloseTo(10 - 0.0167, 6)
    t += 5000
    expect(c.live()).toBeCloseTo(10 - 5.0167, 6)
    c.destroy()
  })
  it('holds while paused, resumes from there, clamps at zero, resets to the duration', () => {
    let t = 0
    const c = createCountdown(4, () => {}, () => t)
    c.start(); t = 1500; c.pause()
    const held = c.live()
    t = 99999
    expect(c.live()).toBeCloseTo(held, 9)       // paused: frozen
    c.start(); t += 1000
    expect(c.live()).toBeCloseTo(held - 1, 6)
    t += 1e6
    expect(c.live()).toBe(0)
    c.reset()
    expect(c.live()).toBe(4)
    c.destroy()
  })
  it('an unstarted clock reports its full duration', () => {
    expect(createCountdown(7, () => {}, () => 123).live()).toBe(7)
  })
})
