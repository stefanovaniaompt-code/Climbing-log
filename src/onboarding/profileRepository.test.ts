import { describe, expect, it } from 'vitest'
import { shouldRequireLegacyAthleteOnboarding } from './profileRepository'

describe('shouldRequireLegacyAthleteOnboarding', () => {
  it('richiede onboarding a un atleta collegato ma incompleto', () => {
    expect(
      shouldRequireLegacyAthleteOnboarding(
        'athlete',
        'athlete-id',
        null,
      ),
    ).toBe(true)
  })

  it('non richiede onboarding a un atleta gia completato', () => {
    expect(
      shouldRequireLegacyAthleteOnboarding(
        'athlete',
        'athlete-id',
        '2026-09-12T08:00:00.000Z',
      ),
    ).toBe(false)
  })

  it('non trasforma un coach incompleto in onboarding atleta', () => {
    expect(
      shouldRequireLegacyAthleteOnboarding(
        'coach',
        null,
        null,
      ),
    ).toBe(false)
  })

  it('non avvia onboarding senza identita atleta', () => {
    expect(
      shouldRequireLegacyAthleteOnboarding(
        'athlete',
        null,
        null,
      ),
    ).toBe(false)
  })
})
