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
