// The armed-window state machine. Saying the wake word ARMS the assistant for a few
// seconds; while armed, ANY utterance is a command — no wake word needed — so the user can
// pause and think after "benchpilot" instead of blurting everything in one breath.
//
// Pure logic over exactly one timer, so it unit-tests with fake timers (no mic, no React):
//   wake()           → arm (or extend); onArm fires only on the idle→armed edge (the blip)
//   speech()         → any speech activity extends the window (never disarm mid-sentence)
//   commandHandled() → after a command, stay armed briefly for a follow-up, then disarm
//   cancel()         → explicit "never mind" → disarm now
//   (timeout)        → disarms silently; onDisarm gets the reason ('timeout' | 'cancel')

export const ARM_MS = 7000       // silence after waking before it disarms — time to think
export const FOLLOWUP_MS = 3000  // quiet grace after a command, for a follow-up without re-waking

export function createArming({ armMs = ARM_MS, followupMs = FOLLOWUP_MS, onArm, onDisarm } = {}) {
  let armed = false
  let timer = null
  const clear = () => { if (timer != null) { clearTimeout(timer); timer = null } }
  const schedule = (ms) => { clear(); timer = setTimeout(() => disarm('timeout'), ms) }
  const disarm = (reason) => { if (!armed) return; armed = false; clear(); if (onDisarm) onDisarm(reason) }

  return {
    get armed() { return armed },
    // wake word landed — arm (or, if already armed, just extend). The blip only fires on
    // the first arm, so re-hearing the wake word mid-window doesn't re-blip.
    wake() {
      const was = armed
      armed = true
      schedule(armMs)
      if (!was && onArm) onArm()
    },
    // interim speech activity keeps the window open (a thinking pause must not disarm)
    speech() { if (armed) schedule(armMs) },
    // a command was dispatched — hold a short follow-up window, then disarm
    commandHandled() { if (armed) schedule(followupMs) },
    cancel() { disarm('cancel') },
    destroy() { clear() },
  }
}

// explicit stand-downs — treated as a command that just disarms, never a real intent
const CANCEL_RE = /^(?:never\s*mind|nevermind|cancel(?:\s+that)?|forget it|forget that|stop listening|dismiss|not now|as you were)\b/i
export function isCancel(text) {
  return CANCEL_RE.test(String(text || '').trim())
}
