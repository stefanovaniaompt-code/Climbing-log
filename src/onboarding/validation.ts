import type { OnboardingErrors, OnboardingInput } from './types'

export function validateOnboarding(input: OnboardingInput): OnboardingErrors {
  const errors: OnboardingErrors = {}
  const displayName = input.displayName.trim()
  const workspaceName = input.workspaceName.trim()
  const invitationToken = input.invitationToken.trim()

  if (displayName.length < 2) errors.displayName = 'Inserisci almeno 2 caratteri.'
  if (displayName.length > 80) errors.displayName = 'Usa al massimo 80 caratteri.'
  if (input.workspaceMode !== 'invitation' && workspaceName.length < 2) {
    errors.workspaceName = 'Inserisci il nome dello spazio di lavoro.'
  }
  if (workspaceName.length > 80) errors.workspaceName = 'Usa al massimo 80 caratteri.'
  if (input.workspaceMode === 'invitation' && invitationToken.length < 12) {
    errors.invitationToken = 'Il codice invito non è valido.'
  }
  if (input.role === 'coach' && input.workspaceMode !== 'create') {
    errors.workspaceMode = 'Un coach deve creare il proprio workspace in questa fase.'
  }

  return errors
}

export function isOnboardingValid(errors: OnboardingErrors) {
  return Object.keys(errors).length === 0
}
