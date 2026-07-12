// The voice feedback channel. With no speech output, these short generated cues carry
// EVERYTHING, so they are designed to be told apart without looking: rising = good,
// falling = bad, and the two most consequential ones (timer done, hazard) are the
// loudest and most distinct. All synthesized with WebAudio — no assets, no network.
//
// createSoundboard() returns a stable object of cue functions. It is safe to build and
// call anywhere: with no WebAudio (node tests, older browsers) every cue is a no-op, so
// it never throws and never blocks the run.

const CUES = ['wake', 'accepted', 'rejected', 'confirm', 'timerStart', 'timerDone', 'hazard', 'disarm']

export function createSoundboard() {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!Ctx) {
    // graceful degradation: a full no-op board with the same shape
    const noop = () => {}
    return Object.assign({ resume: noop, available: false }, ...CUES.map((c) => ({ [c]: noop })))
  }

  let ctx = null
  const ensure = () => {
    if (!ctx) ctx = new Ctx()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }

  // one enveloped oscillator note
  function note(freq, start, dur, { type = 'sine', peak = 0.22, glideTo = null } = {}) {
    const c = ctx
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    osc.connect(gain).connect(c.destination)
    osc.start(start)
    osc.stop(start + dur + 0.02)
  }

  // a short filtered-noise burst — for the unmistakable "done" and "hazard" cues
  function noise(start, dur, { peak = 0.18, freq = 1200, q = 0.7 } = {}) {
    const c = ctx
    const len = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = c.createBufferSource(); src.buffer = buf
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q
    const gain = c.createGain()
    gain.gain.setValueAtTime(peak, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    src.connect(bp).connect(gain).connect(c.destination)
    src.start(start); src.stop(start + dur)
  }

  const guard = (fn) => () => { try { const c = ensure(); const t = c.currentTime; fn(t) } catch { /* audio is a nicety */ } }

  return {
    available: true,
    resume: () => { try { ensure() } catch { /* ignore */ } },

    // soft single blip — "I'm listening" the instant the wake word lands
    wake: guard((t) => note(660, t, 0.09, { type: 'sine', peak: 0.14 })),

    // a quiet low descending pair — "stood down" (armed window timed out). NOT an error:
    // saying the wake word and thinking better of it is not a failure.
    disarm: guard((t) => { note(520, t, 0.09, { type: 'sine', peak: 0.08 }); note(390, t + 0.08, 0.12, { type: 'sine', peak: 0.08 }) }),

    // brief confident rising two-note — command accepted
    accepted: guard((t) => { note(680, t, 0.09, { peak: 0.2 }); note(1020, t + 0.075, 0.12, { peak: 0.2 }) }),

    // distinct low FALLING buzz — "nope". Square + downward glide so it can never be
    // mistaken for the rising accept (a misheard failure would strand a scientist).
    rejected: guard((t) => note(300, t, 0.26, { type: 'square', peak: 0.16, glideTo: 150 })),

    // a questioning two-note SAME-pitch tick — "say it again" (confirmation gate)
    confirm: guard((t) => { note(520, t, 0.08, { type: 'triangle', peak: 0.16 }); note(520, t + 0.14, 0.1, { type: 'triangle', peak: 0.16 }) }),

    // bright rising arpeggio — a timer has started counting
    timerStart: guard((t) => { note(523, t, 0.1); note(659, t + 0.09, 0.1); note(784, t + 0.18, 0.14) }),

    // THE most important sound: loud, long, unmistakable across a noisy lab. A triad
    // fanfare repeated with a noise transient so it reads as "STOP — it's done".
    timerDone: guard((t) => {
      ;[0, 0.001].forEach((o) => { note(784, t + o, 0.5, { peak: 0.3 }); note(988, t + o, 0.5, { peak: 0.28 }); note(1319, t + o, 0.55, { peak: 0.26 }) })
      note(784, t + 0.5, 0.4, { peak: 0.3 }); note(1319, t + 0.5, 0.45, { peak: 0.28 })
      noise(t, 0.06, { peak: 0.12, freq: 2000 })
    }),

    // distinct alert double-tone — a hazard on the step you just landed on (incl. a
    // negative "do NOT…"): urgent, dissonant, not to be confused with an accept.
    hazard: guard((t) => {
      note(880, t, 0.16, { type: 'sawtooth', peak: 0.2 })
      note(830, t + 0.19, 0.22, { type: 'sawtooth', peak: 0.2 })
      noise(t, 0.05, { peak: 0.1, freq: 900 })
    }),
  }
}
