import { describe, it, expect } from 'vitest'
import {
  emptyRunState, EMPTY_RUN_STATE, makeRunId, parseRunState, orphanRunKeys, runStateKey, runLogKey,
} from './runState.js'

describe('emptyRunState', () => {
  it('is a fresh, empty run every time (no shared mutable refs)', () => {
    const a = emptyRunState(); const b = emptyRunState()
    expect(a).toEqual({ step: 0, altByStep: {}, passByStep: {}, ackedHazards: {}, finished: false })
    a.passByStep[5] = 3
    expect(b.passByStep).toEqual({}) // not shared with the previous run
    expect(EMPTY_RUN_STATE.passByStep).toEqual({})
  })
})

describe('makeRunId', () => {
  it('is unique across distinct clock/random sources', () => {
    const a = makeRunId(1_000, 0.1)
    const b = makeRunId(1_001, 0.1)
    const c = makeRunId(1_000, 0.999)
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^r/)
  })
})

describe('parseRunState', () => {
  it('missing / garbage → a complete empty state', () => {
    expect(parseRunState(null)).toEqual(emptyRunState())
    expect(parseRunState('not json')).toEqual(emptyRunState())
    expect(parseRunState('42')).toEqual(emptyRunState())
  })
  it('restores a persisted run (resume) fully', () => {
    const saved = JSON.stringify({ step: 7, altByStep: { 3: 1 }, passByStep: { 9: 2 }, ackedHazards: { '9:x': true }, finished: false })
    expect(parseRunState(saved)).toEqual({ step: 7, altByStep: { 3: 1 }, passByStep: { 9: 2 }, ackedHazards: { '9:x': true }, finished: false })
  })
  it('merges a partial / old-shape blob onto the empty defaults (no undefined leaks)', () => {
    const r = parseRunState(JSON.stringify({ step: 3 }))
    expect(r).toEqual({ step: 3, altByStep: {}, passByStep: {}, ackedHazards: {}, finished: false })
  })
})

describe('orphanRunKeys (the storage sweep)', () => {
  it('flags every run/runlog key that is not the current run', () => {
    const keys = [
      'benchpilot.theme', 'benchpilot.bench',        // preferences — never touched
      runStateKey('rOLD'), runLogKey('rOLD'),
      runStateKey('rCUR'), runLogKey('rCUR'),
      'benchpilot.runlog.Neutrophil RNA extraction', // legacy protocol-keyed log — orphaned
    ]
    expect(orphanRunKeys(keys, 'rCUR')).toEqual([
      runStateKey('rOLD'), runLogKey('rOLD'), 'benchpilot.runlog.Neutrophil RNA extraction',
    ])
  })
  it('keeps the current run and all non-run keys', () => {
    const keys = ['benchpilot.theme', runStateKey('rCUR'), runLogKey('rCUR')]
    expect(orphanRunKeys(keys, 'rCUR')).toEqual([])
  })
})
