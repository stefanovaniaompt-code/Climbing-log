export type AppRole = 'athlete' | 'coach'
export type AppCapabilities = {
  canAccessCoachArea: boolean
  canAccessAthleteArea: boolean
}
export type WorkspaceMode = 'personal' | 'create' | 'invitation'

export type AppProfile = {
  userId: string
  displayName: string
  role: AppRole
  athleteId: string | null
  capabilities: AppCapabilities
  workspaceId: string
  workspaceName: string
  onboardingCompletedAt: string
  mustChangePassword: boolean
}

export function availableModes(capabilities: AppCapabilities): AppRole[] {
  return [capabilities.canAccessCoachArea ? 'coach' : null, capabilities.canAccessAthleteArea ? 'athlete' : null].filter((mode): mode is AppRole => mode !== null)
}

export function defaultMode(capabilities: AppCapabilities): AppRole {
  return capabilities.canAccessCoachArea ? 'coach' : 'athlete'
}

export type OnboardingInput = {
  displayName: string
  role: AppRole
  workspaceMode: WorkspaceMode
  workspaceName: string
  invitationToken: string
  birthDate?: string
  weightKg?: string
  heightCm?: string
}

export type OnboardingErrors = Partial<Record<keyof OnboardingInput, string>>
