import { describe, it, expect } from 'vitest'
import { nestsInto, transferKind, resolveInstrument, isInstrumentReading } from './containerContract.js'

// Stage 38: a wrong instrument is worse than a missing one. The measure fallback must
// terminate at the bench, and an unmodelled measure ("weigh the crystals") must NOT borrow
// a plausible device just because its container matches one.
describe('never fake an instrument', () => {
  it('resolveInstrument falls back to the bench, never a plausible device', () => {
    expect(resolveInstrument('measure', 'bottle')).toBe('bench')   // no measure device takes a bottle
    expect(resolveInstrument('measure', 'agar_plate')).toBe('bench')
    expect(resolveInstrument('incubate', 'gel')).toBe('bench')
    expect(resolveInstrument('measure', 'flask')).toBe('inverted_microscope') // legit: observe cells
  })
  it('isInstrumentReading accepts real readings/observations from the tested protocols', () => {
    for (const t of [
      'NanoDrop: A260/280 around 2.0', 'Read the absorbance in the plate reader at 450 nm.',
      'Examine the slide under the light microscope', 'Observe the cells under the microscope',
      'Count the cells using a hemocytometer', 'Monitor cell viability prior to subculturing.',
      'place the gel on the transilluminator to visualize and photograph the DNA bands under UV',
      'Bioanalyzer or TapeStation (RIN)',
    ]) expect(isInstrumentReading(t), t).toBe(true)
  })
  it('isInstrumentReading rejects an unmodelled measure → the caller benches it', () => {
    expect(isInstrumentReading('Dry the crystals and weigh them.')).toBe(false)
    expect(isInstrumentReading('Weigh the dry product.')).toBe(false)
    expect(isInstrumentReading('')).toBe(false)
  })
})

// A transfer is classified from the CONTRACT, not from what a station happens to look
// like at rest. Pinning that classification here is what makes a regression FAIL: if
// step 20 (spin_column → tube) ever stops being a 'nest' and silently becomes a fill,
// this suite goes red instead of the eye having to catch a fake.
describe('transferKind — nest vs contents vs rest (the real step-20 fix)', () => {
  it('spin_column → tube is a NEST (the column is seated into a clean tube)', () => {
    expect(transferKind('spin_column', 'tube')).toBe('nest')
    expect(transferKind('spin_column', 'eluate_tube')).toBe('nest')
    expect(transferKind('spin_column', 'microtube')).toBe('nest')
  })
  it('microtube → spin_column is a CONTENTS move (the sample is pipetted in)', () => {
    expect(transferKind('microtube', 'spin_column')).toBe('contents')
  })
  it('across different vessels with no nest is CONTENTS', () => {
    expect(transferKind('tube', 'cryovial')).toBe('contents')   // cryopreservation
    expect(transferKind('flask', 'tube')).toBe('contents')      // passaging
  })
  it('same vessel type, or no previous container, is REST (never a fill)', () => {
    expect(transferKind('tube', 'tube')).toBe('rest')           // ELISA aliquot
    expect(transferKind('gel', 'gel')).toBe('rest')             // agarose
    expect(transferKind(null, 'tube')).toBe('rest')
    expect(transferKind(undefined, 'spin_column')).toBe('rest')
  })
})

describe('nestsInto — the contract that selects the vessel-move path', () => {
  it('the spin column declares it nests into the collection tubes', () => {
    expect(nestsInto('spin_column', 'tube')).toBe(true)
    expect(nestsInto('spin_column', 'eluate_tube')).toBe(true)
  })
  it('a plain tube does not nest into another tube (that would be an aliquot, not a nest)', () => {
    expect(nestsInto('tube', 'tube')).toBe(false)
    expect(nestsInto('microtube', 'spin_column')).toBe(false)
  })
})
