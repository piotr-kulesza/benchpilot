import { useEffect, useRef, useState, useCallback } from 'react'

// A wall-clock countdown. All the impure timer stuff lives here so the runtime
// logic stays pure/testable. Resets whenever `seconds` changes (i.e. new step).
export function useCountdown(seconds) {
  const [remaining, setRemaining] = useState(seconds || 0)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const endRef = useRef(null)
  const rafRef = useRef(null)

  // reset on step change
  useEffect(() => {
    setRemaining(seconds || 0)
    setRunning(false)
    setDone(false)
    endRef.current = null
  }, [seconds])

  const tick = useCallback(() => {
    if (endRef.current == null) return
    const left = Math.max(0, (endRef.current - Date.now()) / 1000)
    setRemaining(left)
    if (left <= 0) {
      setRunning(false)
      setDone(true)
      endRef.current = null
      beep()
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const start = useCallback(() => {
    if (remaining <= 0) return
    endRef.current = Date.now() + remaining * 1000
    setRunning(true)
    setDone(false)
    rafRef.current = requestAnimationFrame(tick)
  }, [remaining, tick])

  const pause = useCallback(() => {
    setRunning(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    endRef.current = null
  }, [])

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setRemaining(seconds || 0)
    setRunning(false)
    setDone(false)
    endRef.current = null
  }, [seconds])

  useEffect(() => () => rafRef.current && cancelAnimationFrame(rafRef.current), [])

  return { remaining, running, done, start, pause, reset }
}

// A short two-tone chime via WebAudio — no asset, no network.
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.18
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.34)
    })
    setTimeout(() => ctx.close(), 900)
  } catch {
    /* audio is a nicety; never let it break the run */
  }
}
