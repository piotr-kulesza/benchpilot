import { useEffect, useRef, useState, useCallback } from 'react'

// TICK_MS: how often the display value refreshes. The wall-clock itself is EXACT
// (remaining is derived from an absolute end-time, not accumulated), so this only sets
// the readout cadence. It is deliberately NOT rAF: the old rAF loop refreshed at 60 Hz,
// which re-rendered the whole runner (and, since the 3D dial started reading the timer,
// the entire 3D react tree) every frame — heavy enough to stall the clock under load.
// A plain interval, owned in a ref, is decoupled from the render loop and never torn
// down by a re-render. 100 ms keeps the seconds digit and the dial smooth at ~1/6th the
// churn.
const TICK_MS = 100

// A pure, framework-agnostic wall-clock countdown — no React, so it is unit-testable
// with vi.useFakeTimers(). It owns exactly one interval and derives `remaining` from an
// absolute end-time, so it can't drift and the interval is cleared in exactly one place.
// `now` is the FRAME clock the 3D reads through live() — performance.now in the app, and
// the fixed-step clock the capture harness installs (scripts/lib/determinism.mjs pins
// performance.now), so seeded renders stay deterministic. The text readout keeps its own
// Date-based 10 Hz tick, unchanged.
const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

export function createCountdown(seconds, onChange, now = perfNow) {
  let duration = seconds || 0
  let remaining = duration
  let running = false
  let done = false
  let endAt = null      // absolute wall-clock end (ms) while running
  let interval = null
  // the frame clock's own anchor: `liveFrom` seconds remained at frame-clock time `liveAt`
  let liveFrom = duration, liveAt = null, pausedLive = null

  const emit = () => onChange({ remaining, running, done })
  const clear = () => { if (interval != null) { clearInterval(interval); interval = null } }

  function tick() {
    if (endAt == null) return
    remaining = Math.max(0, (endAt - Date.now()) / 1000)
    if (remaining <= 0) {
      remaining = 0; running = false; done = true; endAt = null; clear()
    }
    emit()
  }

  return {
    get state() { return { remaining, running, done } },
    // Remaining seconds for THIS frame, from the injected frame clock — read by the 3D every
    // frame, so a timed animation advances every frame instead of on the 10 Hz tick.
    live() {
      if (done) return 0
      if (!running) return pausedLive != null ? pausedLive : remaining
      return Math.max(0, liveFrom - (now() - liveAt) / 1000)
    },
    start() {
      const from = remaining > 0 ? remaining : duration
      if (from <= 0) return
      liveFrom = pausedLive != null ? pausedLive : from; liveAt = now(); pausedLive = null
      remaining = from; running = true; done = false
      endAt = Date.now() + from * 1000
      clear(); interval = setInterval(tick, TICK_MS)
      emit()
    },
    // Pause freezes at the current value (resume continues from here); Reset returns to
    // the full duration. Both clear the single interval — the ONLY teardown points.
    pause() { if (running) pausedLive = this.live(); clear(); endAt = null; running = false; emit() },
    reset() { clear(); endAt = null; pausedLive = null; remaining = duration; running = false; done = false; emit() },
    // A genuine step change swaps the duration and returns to a fresh ready state.
    setDuration(s) { clear(); endAt = null; pausedLive = null; duration = s || 0; remaining = duration; running = false; done = false; emit() },
    destroy() { clear() },
  }
}

// a new clock: a new STEP or a new duration (by the number alone, a 60 s step after a 60 s step kept the
// first one's finished clock — its spin never ran)
export function countdownChanged(prev, next) { return prev.seconds !== next.seconds || prev.step !== next.step }

// A wall-clock countdown hook. The clock lives in a ref built ONCE, so no re-render of
// this component or anything around it re-creates it or tears down its interval. Resets
// only when `seconds` actually changes (a new step), never on an incidental re-render.
export function useCountdown(seconds, step) {
  const [state, setState] = useState(() => ({ remaining: seconds || 0, running: false, done: false }))
  const clockRef = useRef(null)
  if (clockRef.current == null) clockRef.current = createCountdown(seconds, setState)

  // new step → new duration (a same-value re-render leaves a running clock untouched
  // because the effect only fires when the number `seconds` truly changes).
  const lastRef = useRef({ seconds, step })
  useEffect(() => {
    const next = { seconds, step }
    if (!countdownChanged(lastRef.current, next)) return   // built with this duration already / a re-render
    lastRef.current = next
    clockRef.current.setDuration(seconds || 0)
  }, [seconds, step])

  useEffect(() => () => clockRef.current.destroy(), [])

  const start = useCallback(() => clockRef.current.start(), [])
  const pause = useCallback(() => clockRef.current.pause(), [])
  const reset = useCallback(() => clockRef.current.reset(), [])

  // The false→true completion edge, surfaced as a boolean the caller can watch. The DONE
  // SOUND is played by the shared soundboard (one cue source for the whole app), not here,
  // so the clock stays WebAudio-free and node-testable.
  // live(): per-frame remaining for the 3D (see createCountdown) — stable identity
  const live = useCallback(() => clockRef.current.live(), [])
  return { remaining: state.remaining, running: state.running, done: state.done, start, pause, reset, live }
}
