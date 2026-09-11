import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'

export async function requestCoachLink(profile: AppProfile, coachEmail: string) {
  if (!profile.capabilities.canAccessAthleteArea) throw new Error('Prima deve essere disponibile una identità atleta.')
  if (!supabase || profile.userId.startsWith('00000000-')) return 'pending'
  const { data, error } = await supabase.rpc('request_coach_link', { p_coach_email: coachEmail.trim().toLowerCase() })
  if (error) throw error
  return data as 'pending' | 'active'
}
