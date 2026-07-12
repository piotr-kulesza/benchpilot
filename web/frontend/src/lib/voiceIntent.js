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
  'next', 'back', 'goto',
  'start_timer', 'pause_timer', 'reset_timer', 'time_remaining',
  'repeat_step', 'count_pass', 'add_note',
  'choose_alternative', 'answer_question',
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
// pipette will not wait for the network on "next". The LLM is for the long tail only.
// Conservative on purpose: anchored patterns so lab chatter can't trip a false accept.
const LOCAL = [
  [/^(?:next|forward|go on|continue|move on|next step|go ahead|carry on)\b.*$/, 'next'],
  [/^(?:back|go back|previous(?: step)?|last step|step back)\b.*$/, 'back'],
  [/^(?:start|begin|run|go)(?:\s+(?:the\s+)?timer)?\s*$/, 'start_timer'],
  [/^(?:start|begin|run)\s+(?:the\s+)?timer\b.*$/, 'start_timer'],
  [/^(?:pause|hold|hold on|freeze)(?:\s+(?:the\s+)?timer)?\s*$/, 'pause_timer'],
  [/^(?:pause|stop)\s+(?:the\s+)?timer\b.*$/, 'pause_timer'],
  [/^reset(?:\s+(?:the\s+)?timer)?\b.*$/, 'reset_timer'],
  [/\b(?:how\s+(?:long|much\s+time)|time\s+(?:left|remaining)|how\s+much\s+longer)\b/, 'time_remaining'],
  [/\b(?:count\s+(?:a\s+|another\s+|one\s+more\s+)?pass|another\s+pass|count\s+it|log\s+a\s+pass)\b/, 'count_pass'],
  [/\b(?:repeat(?:\s+(?:the|this))?\s+step|do\s+(?:it|that|this)\s+again|run\s+(?:it|that)\s+again|repeat\s+that)\b/, 'repeat_step'],
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

export function localIntent(body) {
  const raw = String(body || '').trim()
  if (!raw) return null
  const nm = raw.match(NOTE_RE) || raw.match(NOTE_JOT_RE) || raw.match(NOTE_BARE_RE)
  if (nm) return { action: 'add_note', args: { text: nm[1].trim() }, confidence: 1 }
  const t = raw.toLowerCase()
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

// ── the LLM path (long tail) ────────────────────────────────────────────────
export const INTENT_SYSTEM = [
  'You map ONE short spoken utterance from a lab scientist to ONE action for a protocol',
  'runner. Choose EXACTLY ONE action from this closed set — never invent one:',
  '',
  '  next            — advance to the next step',
  '  back            — go to the previous step',
  '  goto            — jump to a specific step; args {"step": <1-based number>}',
  '  start_timer     — start the current step\'s timer',
  '  pause_timer     — pause a running timer',
  '  reset_timer     — reset the timer to full',
  '  time_remaining  — the user is asking how much time is left (read-only)',
  '  count_pass      — log one pass/cycle of a repeated step',
  '  repeat_step     — repeat / re-run the current step',
  '  add_note        — record a free-text bench note; args {"text": "<verbatim>"}',
  '  choose_alternative — pick one either/or method; args {"index": <0-based>} or {"label": "..."}',
  '  answer_question — answer the step\'s open question; args {"key": "...", "value": "..."}',
  '  unknown         — anything you are not confident about',
  '',
  'Rules: Return STRICT JSON only: {"action": "...", "args": {}, "confidence": 0..1}.',
  'Be conservative. If the utterance is ambiguous, off-topic, lab chatter, or you are',
  'unsure, return "unknown" with low confidence. NEVER guess a destructive action',
  '(goto far away, reset a running timer) — prefer "unknown". confidence reflects how',
  'sure you are the action matches what was said.',
].join('\n')

export function buildIntentUser(body, context = {}) {
  const c = context
  const lines = []
  lines.push(`Step ${c.stepNumber ?? '?'} of ${c.stepCount ?? '?'}: "${(c.stepText || '').slice(0, 160)}"`)
  if (c.hasTimer) {
    lines.push(`Timer: present, ${c.running ? 'RUNNING' : c.done ? 'DONE' : 'ready'}, ${Math.round(c.remaining ?? 0)}s remaining.`)
  } else {
    lines.push('Timer: none on this step.')
  }
  if (Array.isArray(c.alternatives) && c.alternatives.length) {
    lines.push('Alternatives: ' + c.alternatives.map((a, i) => `[${i}] ${a}`).join(' | '))
  }
  if (c.openQuestion) {
    lines.push(`Open question (key "${c.openQuestion.key}"): ${c.openQuestion.prompt}` +
      (c.openQuestion.options ? ` options: ${c.openQuestion.options.map((o) => `${o.value}=${o.label}`).join(', ')}` : ''))
  }
  lines.push(`User said: "${body}"`)
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
