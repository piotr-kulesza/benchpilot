import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  humanDuration,
  conditionMatchesAnswers,
  resolveConditionals,
  resolveReagents,
  selectAlternative,
  hasAlternatives,
  repeatTarget,
  isOpenEndedRepeat,
  nextPass,
  isCriticalHazard,
  timerSeconds,
  deriveIntakeFields,
} from './runtime.js'

describe('formatDuration -> m:ss / h:mm:ss', () => {
  it('formats seconds under a minute', () => {
    expect(formatDuration(15)).toBe('0:15')
    expect(formatDuration(5)).toBe('0:05')
  })
  it('formats minutes', () => {
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(120)).toBe('2:00')
    expect(formatDuration(900)).toBe('15:00')
    expect(formatDuration(90)).toBe('1:30')
  })
  it('formats hours (24 h freshness window)', () => {
    expect(formatDuration(86400)).toBe('24:00:00')
    expect(formatDuration(3661)).toBe('1:01:01')
  })
  it('is empty for missing / bad input', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(-5)).toBe('')
  })
})

describe('humanDuration badges', () => {
  it('picks the right unit', () => {
    expect(humanDuration(15)).toBe('15 s')
    expect(humanDuration(120)).toBe('2 min')
    expect(humanDuration(900)).toBe('15 min')
    expect(humanDuration(86400)).toBe('24 h')
  })
})

describe('conditional resolution from intake answers', () => {
  it('resolves the cell-count branch to the correct volume', () => {
    const step = {
      conditionals: [
        { condition: '≤ 5×10⁶ komórek', then: 'użyć 350 µl buforu RLT' },
        { condition: '> 5×10⁶ komórek', then: 'użyć 600 µl buforu RLT' },
      ],
    }
    const low = resolveConditionals(step, { cells: 'le' })
    expect(low.selected).toHaveLength(1)
    expect(low.selected[0].then).toContain('350 µl')
    expect(low.rejected[0].then).toContain('600 µl')

    const high = resolveConditionals(step, { cells: 'gt' })
    expect(high.selected[0].then).toContain('600 µl')
  })

  it('leaves branches undecided until answered', () => {
    const step = {
      conditionals: [
        { condition: '≤ 5×10⁶ komórek', then: '350 µl' },
        { condition: '> 5×10⁶ komórek', then: '600 µl' },
      ],
    }
    const r = resolveConditionals(step, {})
    expect(r.selected).toHaveLength(0)
    expect(r.undecided).toHaveLength(2)
  })

  it('resolves the kit branch (Micro not swallowed by "mini")', () => {
    expect(conditionMatchesAnswers('zestaw RNeasy Micro', { kit: 'micro' })).toBe(true)
    expect(conditionMatchesAnswers('zestaw RNeasy Micro', { kit: 'mini' })).toBe(false)
    expect(conditionMatchesAnswers('zestaw RNeasy Mini', { kit: 'mini' })).toBe(true)
    expect(conditionMatchesAnswers('zestaw RNeasy Mini', { kit: 'micro' })).toBe(false)
  })
})

describe('resolveReagents drops contradicted rows, keeps the chosen volume', () => {
  const step = {
    reagents: [
      { name: 'RLT', volume: '350 µl', condition: 'dla ≤ 5×10⁶ komórek' },
      { name: 'RLT', volume: '600 µl', condition: 'dla większej liczby komórek' },
    ],
  }
  it('keeps only 350 µl for a low cell count', () => {
    const rows = resolveReagents(step, { cells: 'le' })
    expect(rows).toHaveLength(1)
    expect(rows[0].volume).toBe('350 µl')
    expect(rows[0].state).toBe('selected')
  })
  it('keeps both (undecided) before answering', () => {
    const rows = resolveReagents(step, {})
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.state === 'undecided')).toBe(true)
  })
})

describe('alternative selection (either/or)', () => {
  const step = {
    alternatives: [
      { text: 'QIAshredder 2 min', duration_seconds: 120, spin: { duration_seconds: 120 } },
      { text: '5× through a needle', repeat: { count: 5 } },
    ],
  }
  it('detects alternatives', () => {
    expect(hasAlternatives(step)).toBe(true)
    expect(hasAlternatives({ alternatives: [] })).toBe(false)
  })
  it('defaults to the first branch and switches on demand', () => {
    expect(selectAlternative(step).text).toBe('QIAshredder 2 min')
    expect(selectAlternative(step, 1).text).toBe('5× through a needle')
  })
  it('clamps an out-of-range index', () => {
    expect(selectAlternative(step, 9).text).toBe('5× through a needle')
    expect(selectAlternative(step, -3).text).toBe('QIAshredder 2 min')
  })
  it('exposes the chosen branch timer', () => {
    expect(timerSeconds(step, 0)).toBe(120)
    expect(timerSeconds(step, 1)).toBe(null)
  })
})

describe('repeat counting', () => {
  it('reads a fixed count', () => {
    const step = { repeat: { count: 5 } }
    expect(repeatTarget(step)).toBe(5)
    expect(isOpenEndedRepeat(step)).toBe(false)
  })
  it('treats a reason-only repeat as open-ended', () => {
    const step = { repeat: { count: null, reason: 'dla pozostałej objętości' } }
    expect(repeatTarget(step)).toBe(1)
    expect(isOpenEndedRepeat(step)).toBe(true)
  })
  it('advances and clamps passes', () => {
    expect(nextPass(1, 5)).toBe(2)
    expect(nextPass(5, 5)).toBe(5) // clamped at target
    expect(nextPass(2, 1, true)).toBe(3) // open-ended keeps counting
  })
  it('reads a fixed count through an alternative branch', () => {
    const step = { alternatives: [{ text: 'a' }, { text: 'needle', repeat: { count: 5 } }] }
    // effectiveStep on an alternatives-step uses index 0 by default, so no repeat;
    // repeatTarget on the chosen branch object directly:
    expect(repeatTarget(step.alternatives[1])).toBe(5)
  })
})

describe('critical (negative) hazards', () => {
  it('flags negatives boldly', () => {
    expect(isCriticalHazard('Nie wirować')).toBe(true)
    expect(isCriticalHazard('Do NOT centrifuge')).toBe(true)
    expect(isCriticalHazard('Unikać wielokrotnego zamrażania')).toBe(true)
  })
  it('does not flag ordinary cautions', () => {
    expect(isCriticalHazard('Trzymać na lodzie')).toBe(false)
    expect(isCriticalHazard('Praca pod wyciągiem')).toBe(false)
  })
})

describe('deriveIntakeFields from open_parameters + gaps', () => {
  const protocol = {
    open_parameters: [
      { question: 'Który zestaw izolacyjny — RNeasy Mini czy Micro?', where: 'materiały' },
      { question: 'Ile komórek wejściowych?', where: 'liza' },
      { question: 'Jaki jest docelowy próg RIN akceptacji?', where: 'QC' },
      { question: 'Analiza bulk czy single-cell?', where: 'projekt' },
    ],
    steps: [{ index: 5, gaps: [{ parameter: 'liczba komórek', question: 'Ile komórek wejściowych?' }] }],
  }
  it('produces structured kit + cells fields and dedupes', () => {
    const fields = deriveIntakeFields(protocol)
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]))
    expect(byKey.kit.type).toBe('choice')
    expect(byKey.kit.options.map((o) => o.value)).toEqual(['mini', 'micro'])
    expect(byKey.cells.type).toBe('choice')
    // the duplicate cell-count gap question does not create a second field
    expect(fields.filter((f) => f.key === 'cells')).toHaveLength(1)
    expect(byKey.rin.type).toBe('text')
    expect(byKey.analysis.type).toBe('choice')
  })
})
