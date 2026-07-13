// Voice dispatch — turns a resolved intent into a call on the SAME runtime the on-screen
// buttons use. Voice gets NO private code path: `controls` are the very callbacks the
// buttons wire up, so hand and voice can never drift. Pure and side-effect-only-through-
// `controls`, so it unit-tests with spy functions and a plain context object.
//
// Returns { ok, cue, message, needsConfirm, speak, kind } — the caller plays `cue` (a sound)
// and shows `message` on the transcript line. It never plays a sound itself: sounds stay in
// the UI. When `speak` is set, the caller reads it aloud (Web Speech): the design is SOUNDS
// for what it DID (commands), SPEECH for what it KNOWS (answers). `kind: 'answer'` marks the
// app talking back so the UI can style it distinctly.

const CONFIDENCE_MIN = 0.6
// read-only "the app SPEAKS what it knows" — harmless, so a low-confidence question still
// answers (a question is a question; nothing gets mutated).
const READ_ONLY = new Set(['answer', 'time_remaining', 'steps_remaining', 'idle'])

function rejected(message = 'Not understood') { return { ok: false, cue: 'rejected', message } }
function accepted(message, cue = 'accepted') { return { ok: true, cue, message } }
// an ANSWER: spoken aloud AND shown, visually distinct, no command sound.
function spoken(message) { return { ok: true, cue: null, message, speak: message, kind: 'answer' } }

// Natural language — this is SPOKEN, so "2m 30s" (read "two m thirty s") won't do.
function fmtRemaining(context) {
  const r = Math.max(0, Math.round(context.remaining ?? 0))
  const m = Math.floor(r / 60)
  const s = r % 60
  const parts = []
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  if (s > 0 || m === 0) parts.push(`${s} second${s === 1 ? '' : 's'}`)
  return `${parts.join(' ')} remaining`
}

// choose_alternative may arrive as an index or a fuzzy label — resolve to a real index.
function resolveAltIndex(args, context) {
  const alts = context.alternatives || []
  if (!alts.length) return null
  if (Number.isInteger(args.index) && args.index >= 0 && args.index < alts.length) return args.index
  if (typeof args.label === 'string' && args.label.trim()) {
    const q = args.label.toLowerCase().trim()
    let hit = alts.findIndex((a) => String(a).toLowerCase() === q)
    if (hit < 0) hit = alts.findIndex((a) => String(a).toLowerCase().includes(q) || q.includes(String(a).toLowerCase()))
    if (hit >= 0) return hit
  }
  return null
}

// goto is skip-ahead — a destructive-ish jump. Only honour a valid, in-range step number;
// anything vague was already meant to be `unknown` upstream.
function resolveGoto(args, context) {
  const n = Number(args.step ?? args.n ?? args.number)
  if (!Number.isInteger(n)) return null
  const idx = n - 1 // spoken numbers are 1-based
  if (idx < 0 || idx >= (context.stepCount ?? 0)) return null
  return idx
}

// opts.confirmed — the caller re-heard the same reset within the confirm window (the
// "say it again" gate for a running timer).
export function dispatchIntent(intent, controls = {}, context = {}, opts = {}) {
  const action = intent?.action || 'unknown'
  const args = intent?.args || {}
  const confidence = typeof intent?.confidence === 'number' ? intent.confidence : 1

  if (action === 'idle') return { ok: false, cue: null, message: '' } // not addressed — stay silent
  if (action === 'cancel') return { ok: false, cue: null, message: 'Stood down' } // never mind — no-op
  if (action === 'unknown') return rejected()
  // the confidence gate protects STATE CHANGES; a read-only question is harmless, so it is
  // never gated out (a misheard question just gets answered, it can't reset an incubation).
  if (confidence < CONFIDENCE_MIN && !READ_ONLY.has(action)) return rejected('Not sure — say it again')

  switch (action) {
    case 'next':
      if ((context.stepIndex ?? 0) >= (context.stepCount ?? 1) - 1) { controls.next?.(); return accepted('Finishing') }
      controls.next?.(); return accepted('Next step')

    case 'skip_step':
      if ((context.stepIndex ?? 0) >= (context.stepCount ?? 1) - 1) { controls.next?.(); return accepted('Finishing') }
      controls.next?.(); return accepted('Skipped') // skip == advance, via the SAME next control

    case 'back':
      if ((context.stepIndex ?? 0) <= 0) return rejected('Already at the first step')
      controls.back?.(); return accepted('Back a step')

    case 'goto': {
      const idx = resolveGoto(args, context)
      if (idx == null) return rejected("Can't jump there")
      controls.goto?.(idx); return accepted(`Step ${idx + 1}`)
    }

    case 'start_timer':
      if (!context.hasTimer) return rejected('No timer on this step')
      if (context.running) return accepted('Timer already running')
      controls.startTimer?.(); return accepted('Timer started', 'timerStart')

    case 'pause_timer':
      if (!context.hasTimer) return rejected('No timer on this step')
      if (!context.running) return accepted('Timer already paused')
      controls.pauseTimer?.(); return accepted('Timer paused')

    case 'reset_timer':
      if (!context.hasTimer) return rejected('No timer on this step')
      // A running timer is sacred — a misheard "reset" must not wipe a 15-min incubation.
      if (context.running && !opts.confirmed) {
        return { ok: false, cue: 'confirm', needsConfirm: true, message: 'Say “reset” again to reset the running timer' }
      }
      controls.resetTimer?.(); return accepted('Timer reset')

    case 'time_remaining':
      if (!context.hasTimer) return spoken('There is no timer on this step.')
      return spoken(fmtRemaining(context)) // a question → spoken (hands-free), also shown

    case 'steps_remaining': {
      const left = Math.max(0, (context.stepCount ?? 0) - 1 - (context.stepIndex ?? 0))
      return spoken(left === 0 ? 'This is the last step.' : `${left} step${left === 1 ? '' : 's'} to go.`)
    }

    case 'answer': {
      // The scientist asked the protocol a question. Claude has ALREADY composed the answer
      // from the protocol context (including "The protocol doesn't say."). We only relay it —
      // never act, never invent. Spoken aloud + shown as a transcript.
      const text = String(args.text || '').trim()
      if (!text) return rejected("Didn't catch the question")
      return spoken(text)
    }

    case 'count_pass':
    case 'repeat_step':
      controls.countPass?.(); return accepted('Counted a pass')

    case 'add_note': {
      const text = String(args.text || '').trim()
      if (!text) return rejected('Nothing to note — say “note: …”')
      controls.addNote?.(text)
      return accepted(`Noted: “${text}”`)
    }

    case 'choose_alternative': {
      const idx = resolveAltIndex(args, context)
      if (idx == null) return rejected("Couldn't match that option")
      controls.chooseAlternative?.(idx)
      return accepted(`Chose “${context.alternatives[idx]}”`)
    }

    case 'answer_question': {
      const key = args.key || context.openQuestion?.key
      if (!key || args.value == null) return rejected("Didn't catch the answer")
      controls.answerQuestion?.(key, args.value)
      return accepted('Answer noted')
    }

    default:
      return rejected()
  }
}
