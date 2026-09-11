import { describe, expect, it } from 'vitest'
import { availableModes, defaultMode } from './types'

describe('independent app capabilities', () => {
  it('keeps coach-only users out of athlete mode', () => {
    const capabilities = { canAccessCoachArea: true, canAccessAthleteArea: false }
    expect(availableModes(capabilities)).toEqual(['coach'])
    expect(defaultMode(capabilities)).toBe('coach')
  })

  it('keeps athlete-only users out of coach mode', () => {
    const capabilities = { canAccessCoachArea: false, canAccessAthleteArea: true }
    expect(availableModes(capabilities)).toEqual(['athlete'])
    expect(defaultMode(capabilities)).toBe('athlete')
  })

  it('offers both modes to the same account', () => {
    const capabilities = { canAccessCoachArea: true, canAccessAthleteArea: true }
    expect(availableModes(capabilities)).toEqual(['coach', 'athlete'])
  })
})
