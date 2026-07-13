// Voice intent resolution — the thin interface between a spoken transcript and the
// SAME runtime the on-screen buttons drive. Pure and framework-free so it unit-tests
// offline (no mic, no network, no key) with a fake `llm`.
//
//   transcript ──stripWake──► body ──localIntent (fast path)──► intent
//                                   └─► llm(system,user) ─parseIntent─► intent
//
// The model only ever CHOOSES among the closed action set below; it never invents an
// action and never executes anything. Dispatch (voiceDispatch.js) is what acts.

// The closed set. `idle` (not addressed) and `unknown` are sentinels the dispatcher
// treats as no-ops; everything else maps to a real runtime call.
export const INTENT_ACTIONS = [
  'next', 'back', 'goto', 'skip_step',
  'start_timer', 'pause_timer', 'reset_timer', 'time_remaining', 'steps_remaining',
  'repeat_step', 'count_pass', 'add_note',
  'choose_alternative', 'answer_question',
  'answer',   // the scientist ASKS the protocol a question; Claude answers from context (SPOKEN)
  'cancel',   // "never mind" — disarm, do nothing
  'unknown',
]
const ACTION_SET = new Set(INTENT_ACTIONS)

export const WAKE_WORD = 'benchpilot'
// tolerate the STT splitting it ("bench pilot"), a hyphen, or a leading "hey".
const WAKE_RE = /\b(?:hey[,\s]+)?bench[\s-]?pilot\b/i

export function hasWake(transcript) {
  return WAKE_RE.test(String(transcript || ''))
}

// Everything after the wake word (that's the command). If the wake word appears more
// than once we take the text after the LAST one — people restart mid-sentence.
export function stripWake(transcript) {
  const s = String(transcript || '')
  let out = s
  let m
  const g = new RegExp(WAKE_RE.source, 'gi')
  while ((m = g.exec(s)) != null) out = s.slice(m.index + m[0].length)
  return out.replace(/^[\s,.:;–—-]+/, '').trim()
}

// Unambiguous, common utterances resolve WITHOUT a round-trip — a scientist with a full
// pipette will not wait for the network on "next". The LLM is for everything else.
//
// STRICT by design (Stage 37): every pattern is fully anchored (^…$) — a CONFIDENT, EXACT
// match or nothing. No trailing `.*`, no mid-string `\b…\b`. That greediness is exactly how
// the fast path used to SWALLOW real speech: "back to the ethanol step" matched `back`,
// "how long do I spin?" matched time_remaining — utterances that should have gone to Claude.
// The fast path NEVER returns `unknown`; a non-match returns null and falls through to Claude.
const LOCAL = [
  [/^(?:next|forward|go on|continue|move on|next step|go ahead|carry on|onward|proceed|keep going)$/, 'next'],
  [/^(?:back|go back|previous|previous step|last step|step back|one back|go one back|go back a step|back a step|back one step)$/, 'back'],
  [/^(?:start|start it|begin|start timer|start the timer|begin the timer|run the timer|start the clock|go timer)$/, 'start_timer'],
  [/^(?:pause|pause it|pause timer|pause the timer|hold|hold on|freeze|stop the timer|stop timer)$/, 'pause_timer'],
  [/^(?:reset|reset it|reset timer|reset the timer|reset the clock)$/, 'reset_timer'],
  [/^(?:time (?:left|remaining)|remaining time|how (?:long|much time) is left|how much(?: time)? is left|how much longer|how much time remaining)\??$/, 'time_remaining'],
  [/^(?:count (?:a |another |one more )?pass|another pass|count it|log a pass|count that|count the pass)$/, 'count_pass'],
  [/^(?:repeat(?: the| this)? step|do (?:it|that|this) again|run (?:it|that) again|repeat that)$/, 'repeat_step'],
  [/^(?:steps (?:left|remaining|to go)|how many steps(?: are)?(?: left| remaining| to go| left to go)?|how many more steps|how many steps left to go)\??$/, 'steps_remaining'],
  [/^(?:skip|skip it|skip step|skip this|skip this step|skip the step)$/, 'skip_step'],
]

// spoken numbers usually arrive as digits from the STT, but not always — cover the small
// range a protocol actually spans.
const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
}
function parseStepNumber(tok) {
  if (/^\d+$/.test(tok)) return parseInt(tok, 10)
  return NUM_WORDS[tok] ?? null
}
// "go to step 11", "jump to 3", "skip to step 7", or a bare "step 11" — an explicit
// destination is unambiguous, so it resolves locally (no round-trip) with the number.
const GOTO_RE = /^(?:go\s*to|goto|jump\s*to|skip\s*to|move\s*to|take me to)\s+(?:step\s+)?(\w+)\b/
const STEP_RE = /^step\s+(\w+)\s*$/

// "note: pellet looked loose", "make a note that the pellet was loose", "add a note …".
// The text after the note phrase is the body, captured VERBATIM from the original casing
// (matched on the raw utterance, not the lowercased one). This is the payoff of voice:
// recording a deviation without stripping a glove.
const NOTE_RE = /^(?:make|take|add|write|leave|log|record)\s+(?:a\s+|the\s+)?note(?:\s+(?:that|saying|about|of|down))?\s*[:,-]?\s*([\s\S]*)$/i
// "jot down …" / "note down …" imply a note without the literal word
const NOTE_JOT_RE = /^(?:jot\b(?:\s+(?:down|this|that))?|note\s+down)\s*(?:(?:a|the)\s+)?(?:note\b\s*(?:that\b)?\s*[:,-]?\s*)?([\s\S]*)$/i
const NOTE_BARE_RE = /^note\b(?:\s+(?:that|saying))?\s*[:,-]?\s*([\s\S]*)$/i

// Tolerate the natural wrapping around a command WITHOUT loosening the exact match: strip a
// leading filler ("ok", "um", "so") and a trailing politeness ("please", "now"), then require
// an exact match. "ok next please" → "next" (fast). "back to the ethanol step" keeps its
// meaning-changing tail, matches nothing, and falls through to Claude — which is the point.
const LEAD_FILLER = /^(?:ok(?:ay)?|umm?|uhh?|er|so|well|hey|yeah|yep|alright|right|and then|and|then|please)[\s,]+/i
const TRAIL_POLITE = /[\s,]+(?:please|now|thanks|thank you|thankyou)$/i
function trimFillers(t) {
  let s = t.trim()
  let prev
  do { prev = s; s = s.replace(LEAD_FILLER, '').trim() } while (s !== prev)
  do { prev = s; s = s.replace(TRAIL_POLITE, '').trim() } while (s !== prev)
  return s
}

// The fast path returns a CONFIDENT EXACT match or null — NEVER 'unknown'. A null falls
// through to Claude (resolveCommand), so the model always gets its chance at the long tail;
// 'unknown' is Claude's verdict to give, not a regex's.
export function localIntent(body) {
  const raw = String(body || '').trim()
  if (!raw) return null
  const nm = raw.match(NOTE_RE) || raw.match(NOTE_JOT_RE) || raw.match(NOTE_BARE_RE)
  if (nm) return { action: 'add_note', args: { text: nm[1].trim() }, confidence: 1 }
  const t = trimFillers(raw.toLowerCase())
  if (!t) return null
  const g = t.match(GOTO_RE) || t.match(STEP_RE)
  if (g) {
    const n = parseStepNumber(g[1])
    if (n != null) return { action: 'goto', args: { step: n }, confidence: 1 }
  }
  for (const [re, action] of LOCAL) {
    if (re.test(t)) return { action, args: {}, confidence: 1 }
  }
  return null
}

// ── the LLM path (free interpretation) ───────────────────────────────────────
// The PRINCIPLE (Stage 37): free interpretation of language, YES — free choice of action,
// NO. Interpret ANY phrasing, then map it onto this CLOSED set. A misheard word must never
// be able to invent a destructive action, so the model only ever CHOOSES from the list; the
// dispatcher (never the model) executes, and it calls the same functions the buttons call.
export const INTENT_SYSTEM = [
  'You are the voice intent resolver for a bench-lab protocol runner. A scientist speaks ONE',
  'utterance (their hands and eyes are busy); interpret it FREELY, then map it onto EXACTLY',
  'ONE action from this CLOSED set. Never invent an action. You never execute anything.',
  '',
  'COMMANDS (the app does something — it will play a sound, not speak):',
  '  next            — advance to the next step',
  '  back            — go to the previous step',
  '  skip_step       — skip the current step (advance without doing it)',
  '  goto            — go to a specific step; args {"step": <1-based number>}. If the user',
  '                    names a step by DESCRIPTION ("the ethanol step", "back to the spin"),',
  '                    find it in the OUTLINE below and return its number.',
  '  start_timer / pause_timer / reset_timer — control the current step\'s timer',
  '  count_pass      — log one pass/cycle of a repeated step',
  '  repeat_step     — repeat / re-run the current step',
  '  add_note        — record a free-text bench note; args {"text": "<verbatim words>"}',
  '  choose_alternative — pick one either/or method; args {"index": <0-based>} or {"label":"..."}',
  '  answer_question — answer the step\'s OPEN INTAKE question; args {"key":"...","value":"..."}',
  '  cancel          — "never mind" / stand down; do nothing',
  '',
  'QUESTIONS (the app SPEAKS a short answer — this is the key capability):',
  '  time_remaining  — "how long is left" on the running timer',
  '  steps_remaining — "how many steps to go"',
  '  answer          — ANY other question about the protocol. args {"text":"<answer>"}.',
  '                    Compose a SHORT (1-2 sentence) answer using ONLY the context below —',
  '                    the whole protocol is given to you (past steps, future steps, the',
  '                    materials list, durations, counts). Examples: "which buffer did I add',
  '                    three steps ago", "do I centrifuge after this", "how many spins are',
  '                    left", "is 2-mercaptoethanol in this one".',
  '                    If the context does NOT contain the answer, args.text must be exactly',
  '                    "The protocol doesn\'t say." — that is a CORRECT, valuable answer (a gap).',
  '                    NEVER invent a fact, a number, or a reagent. It will be read aloud, so',
  '                    keep it short and plain; no markdown.',
  '  unknown         — genuinely unparseable or not confident. Prefer this over a wrong guess.',
  '',
  'Rules: Return STRICT JSON only: {"action":"...","args":{},"confidence":0..1}. NEVER guess a',
  'destructive action (a far goto, resetting a running timer) — use "unknown". A question you',
  'cannot answer from the context is action "answer" with text "The protocol doesn\'t say.",',
  'NOT "unknown". confidence reflects how sure you are of the mapping.',
].join('\n')

export function buildIntentUser(body, context = {}) {
  const c = context
  const lines = []
  lines.push(`CURRENT: step ${c.stepNumber ?? '?'} of ${c.stepCount ?? '?'}${c.stepAction ? ` [${c.stepAction}]` : ''}: "${c.stepText || ''}"`)
  if (Array.isArray(c.reagents) && c.reagents.length) {
    lines.push('  reagents: ' + c.reagents.map((r) => r.volume ? `${r.name} (${r.volume})` : r.name).join(', '))
  }
  if (c.durationSeconds) lines.push(`  duration: ${c.durationSeconds}s`)
  if (Array.isArray(c.hazards) && c.hazards.length) lines.push('  hazards: ' + c.hazards.join('; '))
  if (c.repeat) lines.push(`  repeat: ${c.repeat}`)
  if (Array.isArray(c.alternatives) && c.alternatives.length) {
    lines.push('  alternatives: ' + c.alternatives.map((a, i) => `[${i}] ${a}`).join(' | '))
  }
  if (c.hasTimer) {
    lines.push(`TIMER: present, ${c.running ? 'RUNNING' : c.done ? 'DONE' : 'ready'}, ${Math.round(c.remaining ?? 0)}s remaining.`)
  } else {
    lines.push('TIMER: none on this step.')
  }
  if (c.openQuestion) {
    lines.push(`OPEN INTAKE QUESTION (key "${c.openQuestion.key}"): ${c.openQuestion.prompt}` +
      (c.openQuestion.options ? ` options: ${c.openQuestion.options.map((o) => `${o.value}=${o.label}`).join(', ')}` : ''))
  }
  if (Array.isArray(c.materials) && c.materials.length) {
    lines.push('MATERIALS: ' + c.materials.slice(0, 40).join(', '))
  }
  if (Array.isArray(c.outline) && c.outline.length) {
    lines.push('PROTOCOL OUTLINE (step number. title):')
    for (const s of c.outline) lines.push(`  ${s.n}. ${s.title}`)
  }
  if (c.answers && typeof c.answers === 'object') {
    const a = Object.entries(c.answers).filter(([, v]) => v != null && v !== '')
    if (a.length) lines.push('INTAKE ANSWERS: ' + a.map(([k, v]) => `${k}=${v}`).join(', '))
  }
  lines.push(`USER SAID: "${body}"`)
  return lines.join('\n')
}

// Parse a model reply (possibly fenced / prose-wrapped) into a validated intent from the
// closed set. Anything malformed or off-list collapses to unknown — the model can't push
// us off the rails.
export function parseIntent(raw) {
  const obj = extractJson(raw)
  if (!obj || typeof obj !== 'object') return { action: 'unknown', args: {}, confidence: 0 }
  const action = ACTION_SET.has(obj.action) ? obj.action : 'unknown'
  const args = obj.args && typeof obj.args === 'object' ? obj.args : {}
  let confidence = typeof obj.confidence === 'number' ? obj.confidence : (action === 'unknown' ? 0 : 0.8)
  confidence = Math.max(0, Math.min(1, confidence))
  return { action, args, confidence }
}

function extractJson(raw) {
  const s = String(raw || '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const body = fence ? fence[1] : s
  try { return JSON.parse(body) } catch { /* fall through */ }
  const brace = body.match(/\{[\s\S]*\}/)
  if (brace) { try { return JSON.parse(brace[0]) } catch { /* nope */ } }
  return null
}

// Resolve a BARE command (no wake word — the caller has already handled arming): local fast
// path, else the injectable llm. This is the seam the armed window uses, so a command spoken
// in its own utterance ("benchpilot" … pause … "start") resolves without a wake word.
export async function resolveCommand({ command, context = {}, llm } = {}) {
  const body = String(command || '').trim()
  if (!body) return { heard: '', action: 'unknown', args: {}, confidence: 0, source: 'empty' }
  const local = localIntent(body)
  if (local) return { heard: body, ...local, source: 'local' }
  if (typeof llm !== 'function') return { heard: body, action: 'unknown', args: {}, confidence: 0, source: 'no-llm' }
  try {
    const out = await llm(INTENT_SYSTEM, buildIntentUser(body, context))
    return { heard: body, ...parseIntent(out), source: 'llm' }
  } catch {
    return { heard: body, action: 'unknown', args: {}, confidence: 0, source: 'llm-error' }
  }
}

// The full resolve for a WAKE-in-utterance case: strip the wake word, then resolveCommand.
// `llm(system,user)` is injectable and may be omitted (only the local fast path then works).
export async function resolveIntent({ transcript, context = {}, llm } = {}) {
  const raw = String(transcript || '')
  if (!hasWake(raw)) {
    return { addressed: false, heard: raw.trim(), action: 'idle', args: {}, confidence: 0, source: 'no-wake' }
  }
  const r = await resolveCommand({ command: stripWake(raw), context, llm })
  return { addressed: true, ...r }
}
