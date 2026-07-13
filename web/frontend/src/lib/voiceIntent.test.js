import { describe, it, expect, vi } from 'vitest'
import {
  hasWake, stripWake, localIntent, parseIntent, resolveIntent, resolveCommand, buildIntentUser, INTENT_ACTIONS,
} from './voiceIntent.js'

describe('wake word', () => {
  it('detects the wake word in several forms', () => {
    expect(hasWake('benchpilot next')).toBe(true)
    expect(hasWake('bench pilot, go back')).toBe(true)
    expect(hasWake('Hey benchpilot how long is left')).toBe(true)
    expect(hasWake('BenchPilot start')).toBe(true)
  })
  it('ignores utterances not addressed to it', () => {
    expect(hasWake('can you pass me the next tube')).toBe(false)
    expect(hasWake('next')).toBe(false)
  })
  it('strips the wake word and leading punctuation, keeping the command', () => {
    expect(stripWake('benchpilot, what is next')).toBe('what is next')
    expect(stripWake('bench pilot — go back a step')).toBe('go back a step')
    expect(stripWake('benchpilot')).toBe('')
  })
  it('takes text after the LAST wake word (people restart mid-sentence)', () => {
    expect(stripWake('benchpilot um benchpilot pause the timer')).toBe('pause the timer')
  })
})

describe('local fast path', () => {
  const cases = [
    ['next', 'next'], ['next step please', 'next'], ['continue', 'next'], ['move on', 'next'],
    ['back', 'back'], ['go back a step', 'back'], ['previous step', 'back'],
    ['start', 'start_timer'], ['start the timer', 'start_timer'], ['begin', 'start_timer'],
    ['pause', 'pause_timer'], ['pause the timer', 'pause_timer'], ['hold on', 'pause_timer'],
    ['reset', 'reset_timer'], ['reset the timer', 'reset_timer'],
    ['how long is left', 'time_remaining'], ['how much time remaining', 'time_remaining'],
    ['count a pass', 'count_pass'], ['another pass', 'count_pass'],
    ['repeat this step', 'repeat_step'], ['do that again', 'repeat_step'],
    ['how many steps to go', 'steps_remaining'], ['steps left', 'steps_remaining'],
    ['skip this step', 'skip_step'],
    // filler-tolerant, but still an EXACT command underneath
    ['ok next please', 'next'], ['um, pause the timer', 'pause_timer'], ['next step please', 'next'],
  ]
  for (const [text, action] of cases) {
    it(`"${text}" → ${action}`, () => {
      expect(localIntent(text)?.action).toBe(action)
    })
  }

  // THE Stage-37 invariant: the fast path only ever returns a confident exact match, else
  // null (fall through to Claude). It NEVER returns 'unknown', and it never SWALLOWS an
  // utterance whose meaning is not that bare command.
  it('never returns unknown — a non-match is null, deferred to Claude', () => {
    const deferred = [
      'back to the ethanol step',      // means goto, NOT back
      'how long do I spin',            // a protocol QUESTION, not "time left"
      "I've added the ethanol, count a pass", // a sentence, not the bare command
      'do I centrifuge after this',
      'which buffer did I add three steps ago',
      'is 2-mercaptoethanol in this one',
      'put me back on the spin',
    ]
    for (const u of deferred) {
      const r = localIntent(u)
      expect(r, `"${u}" should defer`).toBeNull()
    }
  })
  it('resolves an explicit goto locally, extracting the step number', () => {
    expect(localIntent('go to step 11')).toEqual({ action: 'goto', args: { step: 11 }, confidence: 1 })
    expect(localIntent('jump to 3')).toMatchObject({ action: 'goto', args: { step: 3 } })
    expect(localIntent('skip to step 7')).toMatchObject({ action: 'goto', args: { step: 7 } })
    expect(localIntent('step 12')).toMatchObject({ action: 'goto', args: { step: 12 } })
    expect(localIntent('go to step eleven')).toMatchObject({ action: 'goto', args: { step: 11 } })
  })
  it('captures a spoken note VERBATIM (preserving case), else an empty note body', () => {
    expect(localIntent('note: pellet looked loose')).toEqual({ action: 'add_note', args: { text: 'pellet looked loose' }, confidence: 1 })
    expect(localIntent('make a note that the RNA looked degraded')).toMatchObject({ action: 'add_note', args: { text: 'the RNA looked degraded' } })
    expect(localIntent('jot down check the pH and OD260').args.text).toBe('check the pH and OD260') // case kept
    expect(localIntent('make a note')).toEqual({ action: 'add_note', args: { text: '' }, confidence: 1 })
  })
  it('does not treat "noted" as a note command', () => {
    expect(localIntent('noted')).toBeNull()
  })
  it('returns null for the long tail (defers to the LLM)', () => {
    expect(localIntent('which tube do I use for the flow-through')).toBeNull()
    expect(localIntent('jump to the elution step')).toBeNull() // no number → not an explicit goto
  })
  it('local intents are full confidence', () => {
    expect(localIntent('next').confidence).toBe(1)
  })
})

describe('parseIntent', () => {
  it('accepts a clean JSON intent from the closed set', () => {
    expect(parseIntent('{"action":"goto","args":{"step":9},"confidence":0.9}'))
      .toEqual({ action: 'goto', args: { step: 9 }, confidence: 0.9 })
  })
  it('unwraps fenced / prose-wrapped JSON', () => {
    expect(parseIntent('Sure!\n```json\n{"action":"next","confidence":0.8}\n```').action).toBe('next')
  })
  it('collapses an off-list action to unknown', () => {
    expect(parseIntent('{"action":"launch_rockets","confidence":1}').action).toBe('unknown')
  })
  it('collapses malformed output to unknown at zero confidence', () => {
    expect(parseIntent('the model rambled with no json')).toEqual({ action: 'unknown', args: {}, confidence: 0 })
  })
  it('clamps confidence into [0,1]', () => {
    expect(parseIntent('{"action":"next","confidence":5}').confidence).toBe(1)
  })
  it('only exposes the documented closed set', () => {
    expect(INTENT_ACTIONS).toContain('unknown')
    expect(INTENT_ACTIONS).not.toContain('idle') // idle is a resolve-layer sentinel, not a model choice
  })
})

describe('resolveIntent', () => {
  const ctx = { stepNumber: 9, stepCount: 24, stepText: 'Centrifuge 15 s at 8000 xg', hasTimer: true, running: false, remaining: 15 }

  it('does not act on utterances without the wake word', async () => {
    const llm = vi.fn()
    const r = await resolveIntent({ transcript: 'next step', context: ctx, llm })
    expect(r.addressed).toBe(false)
    expect(r.action).toBe('idle')
    expect(llm).not.toHaveBeenCalled()
  })

  it('resolves an unambiguous command locally WITHOUT calling the llm', async () => {
    const llm = vi.fn()
    const r = await resolveIntent({ transcript: 'benchpilot next', context: ctx, llm })
    expect(r).toMatchObject({ addressed: true, action: 'next', source: 'local' })
    expect(llm).not.toHaveBeenCalled()
  })

  it('falls back to the llm for the long tail, passing context in the prompt', async () => {
    const llm = vi.fn(async (_sys, user) => {
      expect(user).toContain('Centrifuge 15 s')
      expect(user).toContain('take me to the elution step')
      return '{"action":"goto","args":{"step":12},"confidence":0.9}'
    })
    // no explicit number → not a local goto; the model has to interpret it
    const r = await resolveIntent({ transcript: 'benchpilot take me to the elution step', context: ctx, llm })
    expect(r).toMatchObject({ action: 'goto', args: { step: 12 }, source: 'llm' })
    expect(llm).toHaveBeenCalledOnce()
  })

  it('a protocol QUESTION defers to Claude and returns an answer to be spoken', async () => {
    const llm = vi.fn(async (_sys, user) => {
      expect(user).toContain('which buffer did I add three steps ago')
      return '{"action":"answer","args":{"text":"You added RW1 buffer."},"confidence":0.9}'
    })
    const r = await resolveIntent({ transcript: 'benchpilot which buffer did I add three steps ago', context: ctx, llm })
    expect(r).toMatchObject({ action: 'answer', args: { text: 'You added RW1 buffer.' }, source: 'llm' })
  })

  it('an out-of-protocol question comes back as "the protocol doesn\'t say", not a guess', async () => {
    const llm = vi.fn(async () => '{"action":"answer","args":{"text":"The protocol doesn\'t say."},"confidence":0.9}')
    const r = await resolveIntent({ transcript: 'benchpilot what temperature is the room', context: ctx, llm })
    expect(r).toMatchObject({ action: 'answer' })
    expect(r.args.text).toMatch(/doesn't say/i)
  })

  it('degrades to unknown (not a crash) when the llm throws', async () => {
    const llm = vi.fn(async () => { throw new Error('network down') })
    const r = await resolveIntent({ transcript: 'benchpilot which reagent is this', context: ctx, llm })
    expect(r).toMatchObject({ action: 'unknown', source: 'llm-error' })
  })

  it('with no llm supplied, the long tail is unknown but the fast path still works', async () => {
    expect((await resolveIntent({ transcript: 'benchpilot next' })).action).toBe('next')
    expect((await resolveIntent({ transcript: 'benchpilot explain this step' })).action).toBe('unknown')
  })

  it('empty command after the wake word is unknown, not idle', async () => {
    const r = await resolveIntent({ transcript: 'benchpilot' })
    expect(r).toMatchObject({ addressed: true, action: 'unknown', source: 'empty' })
  })
})

describe('resolveCommand (bare command — the armed-window seam, no wake word)', () => {
  it('resolves a bare command locally', async () => {
    const r = await resolveCommand({ command: 'start' })
    expect(r).toMatchObject({ action: 'start_timer', source: 'local' })
  })
  it('empty command → unknown/empty', async () => {
    expect(await resolveCommand({ command: '  ' })).toMatchObject({ action: 'unknown', source: 'empty' })
  })
  it('defers the long tail to the llm', async () => {
    const llm = vi.fn(async () => '{"action":"goto","args":{"step":12},"confidence":0.9}')
    const r = await resolveCommand({ command: 'take me to the elution step', llm })
    expect(r).toMatchObject({ action: 'goto', source: 'llm' })
    expect(llm).toHaveBeenCalledOnce()
  })
})

describe('buildIntentUser', () => {
  it('summarises the current step, timer, alternatives + open question', () => {
    const u = buildIntentUser('use the micro kit', {
      stepNumber: 3, stepCount: 24, stepText: 'Bind the RNA',
      hasTimer: false, alternatives: ['Mini kit', 'Micro kit'],
      openQuestion: { key: 'kit', prompt: 'Which kit?', options: [{ value: 'mini', label: 'Mini' }, { value: 'micro', label: 'Micro' }] },
    })
    expect(u).toContain('step 3 of 24')
    expect(u).toContain('TIMER: none')
    expect(u).toContain('[1] Micro kit')
    expect(u).toContain('key "kit"')
    expect(u).toContain('USER SAID: "use the micro kit"')
  })

  it('carries the WHOLE protocol so Claude can answer about past/future/materials', () => {
    const u = buildIntentUser('how many spins are left', {
      stepNumber: 6, stepCount: 26, stepText: 'Centrifuge 15 s', stepAction: 'centrifuge',
      reagents: [{ name: 'RW1 buffer', volume: '350 µl' }], hazards: ['Do NOT vortex'],
      hasTimer: false,
      materials: ['RLT buffer', '2-mercaptoethanol'],
      outline: [{ n: 1, title: 'On ice' }, { n: 6, title: 'Spin' }, { n: 24, title: 'Elute' }],
      answers: { kit: 'micro' },
    })
    expect(u).toContain('RW1 buffer (350 µl)')
    expect(u).toContain('hazards: Do NOT vortex')
    expect(u).toContain('MATERIALS: RLT buffer, 2-mercaptoethanol')
    expect(u).toContain('PROTOCOL OUTLINE')
    expect(u).toContain('24. Elute')
    expect(u).toContain('INTAKE ANSWERS: kit=micro')
  })
})
