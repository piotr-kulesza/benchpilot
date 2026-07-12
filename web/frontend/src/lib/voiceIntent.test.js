import { describe, it, expect, vi } from 'vitest'
import {
  hasWake, stripWake, localIntent, parseIntent, resolveIntent, buildIntentUser, INTENT_ACTIONS,
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
    ["I've added the ethanol, count a pass", 'count_pass'], ['another pass', 'count_pass'],
    ['repeat this step', 'repeat_step'], ['do that again', 'repeat_step'],
  ]
  for (const [text, action] of cases) {
    it(`"${text}" → ${action}`, () => {
      expect(localIntent(text)?.action).toBe(action)
    })
  }
  it('returns null for the long tail (defers to the LLM)', () => {
    expect(localIntent('which tube do I use for the flow-through')).toBeNull()
    expect(localIntent('jump to the elution step')).toBeNull()
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
      expect(user).toContain('jump to step 12')
      return '{"action":"goto","args":{"step":12},"confidence":0.9}'
    })
    const r = await resolveIntent({ transcript: 'benchpilot jump to step 12', context: ctx, llm })
    expect(r).toMatchObject({ action: 'goto', args: { step: 12 }, source: 'llm' })
    expect(llm).toHaveBeenCalledOnce()
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

describe('buildIntentUser', () => {
  it('summarises timer + alternatives + open question compactly', () => {
    const u = buildIntentUser('use the micro kit', {
      stepNumber: 3, stepCount: 24, stepText: 'Bind the RNA',
      hasTimer: false, alternatives: ['Mini kit', 'Micro kit'],
      openQuestion: { key: 'kit', prompt: 'Which kit?', options: [{ value: 'mini', label: 'Mini' }, { value: 'micro', label: 'Micro' }] },
    })
    expect(u).toContain('Step 3 of 24')
    expect(u).toContain('Timer: none')
    expect(u).toContain('[1] Micro kit')
    expect(u).toContain('key "kit"')
    expect(u).toContain('User said: "use the micro kit"')
  })
})
