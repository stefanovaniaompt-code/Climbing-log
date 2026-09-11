import { describe, expect, it } from 'vitest'
import { isOnboardingValid, validateOnboarding } from './validation'
import type { OnboardingInput } from './types'

const validAthlete: OnboardingInput = {
  displayName: 'Stefano',
  role: 'athlete',
  workspaceMode: 'personal',
  workspaceName: 'Il mio allenamento',
  invitationToken: '',
}

describe('validateOnboarding', () => {
  it('accetta un workspace personale valido', () => {
    expect(isOnboardingValid(validateOnboarding(validAthlete))).toBe(true)
  })

  it('richiede un token significativo per entrare tramite invito', () => {
    const errors = validateOnboarding({ ...validAthlete, workspaceMode: 'invitation', invitationToken: 'breve' })
    expect(errors.invitationToken).toBeDefined()
  })

  it('impedisce a un coach di saltare la creazione del workspace', () => {
    const errors = validateOnboarding({ ...validAthlete, role: 'coach', workspaceMode: 'personal' })
    expect(errors.workspaceMode).toBeDefined()
  })

  it('normalizza la validazione sui valori vuoti', () => {
    const errors = validateOnboarding({ ...validAthlete, displayName: ' ', workspaceName: ' ' })
    expect(errors).toMatchObject({ displayName: expect.any(String), workspaceName: expect.any(String) })
  })
})
