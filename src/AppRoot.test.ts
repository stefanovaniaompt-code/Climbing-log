import { describe, expect, it } from 'vitest'
import { resolveCapabilityRoute } from './AppRoot'
import type { AppProfile } from './onboarding/types'

const profile = (coach: boolean, athlete: boolean): AppProfile => ({ userId: 'u', displayName: 'Test', role: coach ? 'coach' : 'athlete', athleteId: athlete ? 'a' : null, capabilities: { canAccessCoachArea: coach, canAccessAthleteArea: athlete }, workspaceId: 'w', workspaceName: 'W', onboardingCompletedAt: 'now', mustChangePassword: false })

describe('capability route guards', () => {
  it('redirects coach-only away from athlete route', () => expect(resolveCapabilityRoute('/app/athlete', profile(true, false))).toBe('/app/coach'))
  it('redirects athlete-only away from coach route', () => expect(resolveCapabilityRoute('/app/coach', profile(false, true))).toBe('/app/athlete'))
  it('allows both routes for dual capability', () => { const dual = profile(true, true); expect(resolveCapabilityRoute('/app/coach', dual)).toBeNull(); expect(resolveCapabilityRoute('/app/athlete', dual)).toBeNull() })
})
