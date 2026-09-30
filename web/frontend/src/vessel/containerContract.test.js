import { describe, it, expect } from 'vitest'
import { nestsInto, transferKind } from './containerContract.js'

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

// #5: a gel or a membrane is never pipetted from or into by a transfer. A blot moves
// protein from a gel onto a membrane electrically; nothing liquid crosses between them.
describe("transferKind — gels and membranes are 'place', never a pipette run", () => {
  it('gel -> membrane (a blot) is place', () => {
    expect(transferKind('gel', 'membrane')).toBe('place')
  })
  it('any transfer whose source or destination is a gel or membrane is place', () => {
    expect(transferKind('membrane', 'tube')).toBe('place')
    expect(transferKind('microtube', 'membrane')).toBe('place')
    expect(transferKind('gel', 'tube')).toBe('place')
  })
  it('same-vessel gel/membrane steps stay rest', () => {
    expect(transferKind('gel', 'gel')).toBe('rest')
    expect(transferKind('membrane', 'membrane')).toBe('rest')
  })
  it('other vessels are unchanged', () => {
    expect(transferKind('microtube', 'well_plate')).toBe('contents')
  })
})

// Loading samples from a tube into gel WELLS is done with a pipette — the one gel
// transfer that is a contents move. (Nothing is ever pipetted out of a gel, or into or
// out of a membrane.)
describe('transferKind — loading a gel from a tube is a pipette run', () => {
  it('tube-like source into a gel is contents', () => {
    for (const src of ['microtube', 'tube', 'eluate_tube', 'cryovial']) expect(transferKind(src, 'gel'), src).toBe('contents')
  })
  it('a flat source into a gel, or anything into a membrane, is still place', () => {
    expect(transferKind('well_plate', 'gel')).toBe('place')
    expect(transferKind('microtube', 'membrane')).toBe('place')
  })
})

describe('the 0.2 mL PCR tube', () => {
  it('pcr_tube is its own vessel at its real size, upright, tipped to empty', async () => {
    const { containerContract } = await import('./containerContract.js')
    const c = containerContract('pcr_tube')
    expect(c.spec).toBe('pcr_tube_0_2')
    expect(c.vessel).toBe('pcrtube')
    expect(c.orientation).toBe('upright')
  })
})
