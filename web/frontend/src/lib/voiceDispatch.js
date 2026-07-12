// Voice dispatch — turns a resolved intent into a call on the SAME runtime the on-screen
// buttons use. Voice gets NO private code path: `controls` are the very callbacks the
// buttons wire up, so hand and voice can never drift. Pure and side-effect-only-through-
// `controls`, so it unit-tests with spy functions and a plain context object.
//
// Returns { ok, cue, message, needsConfirm } — the caller plays `cue` (a sound) and shows
// `message` on the transcript line. It never plays a sound itself: sounds stay in the UI.

const CONFIDENCE_MIN = 0.6

function rejected(message = 'Not understood') { return { ok: false, cue: 'rejected', message } }
function accepted(message, cue = 'accepted') { return { ok: true, cue, message } }

function fmtRemaining(context) {
  const r = Math.max(0, Math.round(context.remaining ?? 0))
  const m = Math.floor(r / 60)
  const s = r % 60
  const t = m > 0 ? `${m}m ${s}s` : `${s}s`
  return `${t} remaining`
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
  if (action === 'unknown') return rejected()
  if (confidence < CONFIDENCE_MIN) return rejected('Not sure — say it again')

  switch (action) {
    case 'next':
      if ((context.stepIndex ?? 0) >= (context.stepCount ?? 1) - 1) { controls.next?.(); return accepted('Finishing') }
      controls.next?.(); return accepted('Next step')

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
      if (!context.hasTimer) return rejected('No timer on this step')
      return accepted(fmtRemaining(context)) // read-only; the digits are already on screen

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
