import { describe, it, expect } from 'vitest'
import {
  EVENTS, appendEvent, formatElapsed, computeDeviations, summarize, toMarkdown, toJSON,
} from './runLog.js'

const MIN = 60 * 1000
const T0 = 1_700_000_000_000 // fixed ms base

// a realistic RNA-ish run: intake, a 15-min timer that actually ran 19, a fork, a jump
// that skips steps, a typed/spoken note, an acknowledged hazard, completion.
const RUN = [
  { type: EVENTS.RUN_STARTED, at: T0, step: 1, stepTitle: 'Lyse', name: 'RNA extraction' },
  { type: EVENTS.INTAKE_ANSWER, at: T0, step: 1, key: 'cells', value: 'le', label: 'Cell count', valueLabel: '≤5×10⁶' },
  { type: EVENTS.STEP_COMPLETED, at: T0 + 1 * MIN, step: 1, stepTitle: 'Lyse' },
  { type: EVENTS.TIMER_STARTED, at: T0 + 1 * MIN, step: 2, stepTitle: 'Incubate', nominal: 15 * 60 },
  { type: EVENTS.TIMER_COMPLETED, at: T0 + 20 * MIN, step: 2, stepTitle: 'Incubate', nominal: 15 * 60 }, // ran 19 min
  { type: EVENTS.STEP_COMPLETED, at: T0 + 20 * MIN, step: 2, stepTitle: 'Incubate' },
  { type: EVENTS.ALTERNATIVE_CHOSEN, at: T0 + 21 * MIN, step: 3, stepTitle: 'Homogenize', index: 0, label: 'QIAshredder' },
  { type: EVENTS.STEP_COMPLETED, at: T0 + 22 * MIN, step: 7, stepTitle: 'Elute' }, // completed 2 → 7 skips 3-6
  { type: EVENTS.NOTE, at: T0 + 23 * MIN, step: 7, stepTitle: 'Elute', text: 'pellet looked loose' },
  { type: EVENTS.HAZARD_ACK, at: T0 + 23 * MIN, step: 7, stepTitle: 'Elute', text: 'do NOT vortex' },
  { type: EVENTS.RUN_COMPLETED, at: T0 + 24 * MIN, step: 7, stepTitle: 'Elute' },
]

describe('appendEvent', () => {
  it('is an append-only reducer (no mutation)', () => {
    const a = [{ type: 'a' }]
    const b = appendEvent(a, { type: 'b' })
    expect(b).toHaveLength(2)
    expect(a).toHaveLength(1)
  })
})

describe('formatElapsed', () => {
  it('reads honestly at each scale', () => {
    expect(formatElapsed(45)).toBe('45 s')
    expect(formatElapsed(15 * 60)).toBe('15 min')
    expect(formatElapsed(19 * 60 + 3)).toBe('19 min 3 s')
    expect(formatElapsed(0)).toBe('0 s')
  })
})

describe('computeDeviations', () => {
  const dv = computeDeviations(RUN)
  it('flags a timer that ran materially longer than nominal, with real numbers', () => {
    const long = dv.find((d) => d.kind === 'long_timer')
    expect(long).toBeTruthy()
    expect(long.step).toBe(2)
    expect(long.message).toContain('ran 19 min')
    expect(long.message).toContain('nominal 15 min')
  })
  it('flags skipped steps on a forward jump', () => {
    const skip = dv.find((d) => d.kind === 'skipped')
    expect(skip.skipped).toEqual([3, 4, 5, 6])
    expect(skip.message).toContain('3, 4, 5, 6')
  })
  it('surfaces an acknowledged hazard', () => {
    expect(dv.find((d) => d.kind === 'hazard')?.message).toContain('do NOT vortex')
  })
  it('does not cry wolf when a timer runs on time', () => {
    const onTime = [
      { type: EVENTS.TIMER_STARTED, at: T0, step: 2, nominal: 900 },
      { type: EVENTS.TIMER_COMPLETED, at: T0 + 900 * 1000, step: 2, nominal: 900 },
    ]
    expect(computeDeviations(onTime).some((d) => d.kind === 'long_timer')).toBe(false)
  })
})

describe('summarize', () => {
  it('pulls out params, notes, status', () => {
    const s = summarize(RUN)
    expect(s.protocol).toBe('RNA extraction')
    expect(s.status).toBe('completed')
    expect(s.intake).toHaveLength(1)
    expect(s.notes.map((n) => n.text)).toEqual(['pellet looked loose'])
  })
})

describe('toMarkdown', () => {
  const md = toMarkdown(RUN, { operator: 'PK' })
  it('is paste-ready with every section', () => {
    expect(md).toContain('# Run record — RNA extraction')
    expect(md).toContain('not a certified audit trail')
    expect(md).toContain('**Operator:** PK')
    expect(md).toContain('Cell count: **≤5×10⁶**')
    expect(md).toContain('| Time | Step | Event |')
  })
  it('carries the deviations, the fork, and the note text in order', () => {
    expect(md).toContain('⚠️')
    expect(md).toContain('ran 19 min')
    expect(md).toContain('QIAshredder')
    expect(md).toContain('pellet looked loose')
    // note appears in the timeline AND its own section
    expect(md.indexOf('## Notes')).toBeGreaterThan(md.indexOf('## Timeline'))
  })
})

describe('toJSON', () => {
  it('is valid JSON that machine-reads the run', () => {
    const obj = JSON.parse(toJSON(RUN))
    expect(obj.kind).toBe('benchpilot.run-record')
    expect(obj.parameters[0]).toMatchObject({ key: 'cells', valueLabel: '≤5×10⁶' })
    expect(obj.events).toHaveLength(RUN.length)
  })
})
