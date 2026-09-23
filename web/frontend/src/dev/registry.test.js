import { describe, it, expect } from 'vitest'
import { MATRIX_CELLS, MATRIX_TEXT } from './registry.js'
import { resolveRecipe, stepConditions } from '../vessel/sceneRecipe.js'

// The matrix harness is evidence only if its cells exercise the REAL instrument
// decision. store / heat / incubate_wait / measure decide from the step's stated
// conditions, so every such cell must carry a text, and that text must resolve —
// through the same resolver the runner uses — to the instrument the cell declares.
const CONDITIONED = new Set(['store', 'heat', 'incubate_wait', 'measure'])

describe('matrix cells exercise the real instrument decision', () => {
  const cells = MATRIX_CELLS.filter((c) => CONDITIONED.has(c.action))
  it.each(cells.map((c) => [`${c.action} · ${c.container}`, c]))('%s carries a text that resolves to its declared instrument', (_, c) => {
    const spec = MATRIX_TEXT[`${c.action}:${c.container}`]
    expect(spec, 'no MATRIX_TEXT entry').toBeTruthy()
    expect(c.text).toBe(spec.text)
    const got = resolveRecipe(c.action, { container: c.container, conditions: stepConditions({ text_en: c.text }) }).equipment
    expect(got).toBe(spec.expect)
  })
  it('declares no text for a cell the matrix does not enumerate', () => {
    const keys = new Set(MATRIX_CELLS.map((c) => `${c.action}:${c.container}`))
    expect(Object.keys(MATRIX_TEXT).filter((k) => !keys.has(k))).toEqual([])
  })
})
