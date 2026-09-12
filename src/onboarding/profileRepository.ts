import type { AppUser } from '../auth/AuthProvider'
import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile, OnboardingInput } from './types'

type ProfileRow = {
  user_id: string
  display_name: string
  onboarding_completed_at: string | null
}

type MembershipRow = {
  workspace_id: string
  role: 'athlete' | 'coach'
  workspaces: { name: string } | Array<{ name: string }> | null
}

type LegacyProfileRow = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  role: 'athlete' | 'coach'
  onboarding_completed_at: string | null
  created_at: string
  must_change_password: boolean
}

export function shouldRequireLegacyAthleteOnboarding(
  role: 'athlete' | 'coach',
  athleteId: string | null,
  onboardingCompletedAt: string | null,
) {
  return (
    role === 'athlete' &&
    Boolean(athleteId) &&
    !onboardingCompletedAt
  )
}

async function loadLegacyProfile(user: AppUser): Promise<AppProfile | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,first_name,last_name,role,onboarding_completed_at,created_at,must_change_password')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error('Questo accesso Auth non è collegato a un profilo V1. Esci e usa esattamente l’indirizzo già registrato nella V1.')
  }
  const profile = data as LegacyProfileRow
  const { data: athleteIdentity, error: athleteError } = await supabase
    .from('athletes')
    .select('id')
    .eq('user_id', profile.id)
    .maybeSingle()
  if (athleteError) throw athleteError
  const canAccessCoachArea = profile.role === 'coach'
  const canAccessAthleteArea = Boolean(athleteIdentity)

  if (!canAccessCoachArea && !canAccessAthleteArea) {
    throw new Error(
      'Questo account non ha ancora un’area disponibile.',
    )
  }

  if (
    shouldRequireLegacyAthleteOnboarding(
      profile.role,
      athleteIdentity?.id ?? null,
      profile.onboarding_completed_at,
    )
  ) {
    return null
  }
  const composedName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
  const displayName = composedName || profile.full_name?.trim() || user.email.split('@')[0] || 'Atleta'
  let workspaceId = profile.id
  let workspaceName = profile.role === 'coach' ? `${displayName} · coaching` : 'Climbing Coach'

  if (athleteIdentity && !canAccessCoachArea) {
    const { data: relationship, error: relationshipError } = await supabase
      .from('coach_athletes')
      .select('coach_id')
      .eq('athlete_id', athleteIdentity.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (relationshipError) throw relationshipError
    if (relationship?.coach_id) {
      workspaceId = relationship.coach_id
      workspaceName = 'Programma condiviso'
    }
  }

  return {
    userId: profile.id,
    displayName,
    role: canAccessCoachArea ? 'coach' : 'athlete',
    athleteId: athleteIdentity?.id ?? null,
    capabilities: { canAccessCoachArea, canAccessAthleteArea },
    workspaceId,
    workspaceName,
    onboardingCompletedAt: profile.onboarding_completed_at ?? profile.created_at,
    mustChangePassword: profile.must_change_password,
  }
}

export async function loadProfile(user: AppUser): Promise<AppProfile | null> {
  if (user.isDemo || !supabase) return null
  if (dataRuntime.backendSchema === 'legacy-v1') return loadLegacyProfile(user)

  const [profileResult, membershipResult] = await Promise.all([
    supabase.from('profiles').select('user_id, display_name, onboarding_completed_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('workspace_members').select('workspace_id, role, workspaces(name)').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle(),
  ])

  if (profileResult.error) throw profileResult.error
  if (membershipResult.error) throw membershipResult.error
  if (!profileResult.data?.onboarding_completed_at || !membershipResult.data) return null

  const profile = profileResult.data as ProfileRow
  const membership = membershipResult.data as unknown as MembershipRow
  const workspace = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces

  return {
    userId: profile.user_id,
    displayName: profile.display_name,
    role: membership.role,
    athleteId: membership.role === 'athlete' ? user.id : null,
    capabilities: { canAccessCoachArea: membership.role === 'coach', canAccessAthleteArea: membership.role === 'athlete' },
    workspaceId: membership.workspace_id,
    workspaceName: workspace?.name ?? 'Workspace',
    onboardingCompletedAt: profile.onboarding_completed_at!,
    mustChangePassword: false,
  }
}

export async function completeOnboarding(user: AppUser, input: OnboardingInput): Promise<AppProfile> {
  const now = new Date().toISOString()
  if (user.isDemo || !supabase) {
    return {
      userId: user.id,
      displayName: input.displayName.trim(),
      role: input.role,
      athleteId: input.role === 'athlete' ? user.id : null,
      capabilities: { canAccessCoachArea: input.role === 'coach', canAccessAthleteArea: input.role === 'athlete' },
      workspaceId: '00000000-0000-4000-8000-000000000010',
      workspaceName: input.workspaceMode === 'invitation' ? 'Vertical Lab' : input.workspaceName.trim(),
      onboardingCompletedAt: now,
      mustChangePassword: false,
    }
  }

  if (dataRuntime.backendSchema === 'legacy-v1') {
    const birthDate = input.birthDate?.trim() ?? ''
    const weightKg = Number(input.weightKg)
    const heightCm = Number(input.heightCm)
    const { data, error } = await supabase.rpc('complete_invited_athlete_onboarding', {
      p_full_name: input.displayName.trim(),
      p_birth_date: birthDate,
      p_weight_kg: weightKg,
      p_height_cm: heightCm,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as { athlete_id: string; coach_id: string; completed_at: string } | null
    if (!row) throw new Error('Invito completato senza una relazione coach valida.')
    return {
      userId: user.id,
      displayName: input.displayName.trim(),
      role: 'athlete',
      athleteId: row.athlete_id,
      capabilities: {
        canAccessCoachArea: false,
        canAccessAthleteArea: true,
      },
      workspaceId: row.coach_id,
      workspaceName: 'Programma condiviso',
      onboardingCompletedAt: row.completed_at,
      mustChangePassword: true,
    }
  }

  const { data, error } = await supabase.rpc('complete_onboarding', {
    p_display_name: input.displayName.trim(),
    p_role: input.role,
    p_workspace_name: input.workspaceMode === 'invitation' ? null : input.workspaceName.trim(),
    p_invitation_token: input.workspaceMode === 'invitation' ? input.invitationToken.trim() : null,
  })
  if (error) throw error

  const row = (Array.isArray(data) ? data[0] : data) as {
    workspace_id: string
    workspace_name: string
    member_role: 'athlete' | 'coach'
    completed_at: string
  } | null
  if (!row) throw new Error('Onboarding completato senza un workspace valido.')

  return {
    userId: user.id,
    displayName: input.displayName.trim(),
    role: row.member_role,
    athleteId: row.member_role === 'athlete' ? user.id : null,
    capabilities: { canAccessCoachArea: row.member_role === 'coach', canAccessAthleteArea: row.member_role === 'athlete' },
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    onboardingCompletedAt: row.completed_at,
    mustChangePassword: false,
  }
}
