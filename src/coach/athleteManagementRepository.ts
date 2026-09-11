import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'

export type ManagedAthlete = {
  id: string
  name: string
  initials: string
  status: 'active' | 'inactive' | 'pending'
  email: string | null
  appAccessActive: boolean
}

export type AthleteInvitation = {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'revoked'
  invitedAt: string
}

export type AthleteManagementData = {
  source: 'demo' | 'legacy-v1'
  athletes: ManagedAthlete[]
  invitations: AthleteInvitation[]
  linkRequests: CoachLinkRequest[]
}

export type CoachLinkRequest = { id: string; athleteId: string; athleteName: string; status: 'pending' | 'accepted' | 'rejected'; createdAt: string }

const normalizeEmail = (email: string) => email.trim().toLowerCase()
export const resolveInvitationEmail = (typedEmail: string, savedEmail: string | null) => normalizeEmail(typedEmail || savedEmail || '')
export const buildInvitationPayload = (athleteId: string, email: string) => ({ athlete_id: athleteId, email, status: 'pending' as const })
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AT'

export async function loadAthleteManagement(profile: AppProfile): Promise<AthleteManagementData> {
  if (!supabase || profile.userId.startsWith('00000000-') || dataRuntime.backendSchema !== 'legacy-v1') {
    return { source: 'demo', athletes: [{ id: 'demo-a', name: 'Sara Monti', initials: 'SM', status: 'active', email: null, appAccessActive: false }], invitations: [], linkRequests: [] }
  }
  const [relationsResult, invitesResult, requestsResult] = await Promise.all([
    supabase.from('coach_athletes').select('athlete_id,status').eq('coach_id', profile.userId).order('created_at', { ascending: false }),
    supabase.from('athlete_invitations').select('id,email,status,invited_at').eq('coach_id', profile.userId).order('invited_at', { ascending: false }),
    supabase.from('coach_link_requests').select('id,athlete_id,status,created_at').eq('coach_id', profile.userId).order('created_at', { ascending: false }),
  ])
  if (relationsResult.error) throw relationsResult.error
  if (invitesResult.error) throw invitesResult.error
  if (requestsResult.error) throw requestsResult.error
  const relations = (relationsResult.data ?? []) as Array<{ athlete_id: string; status: ManagedAthlete['status'] }>
  const ids = relations.map(item => item.athlete_id)
  const requestRows = (requestsResult.data ?? []) as Array<{ id: string; athlete_id: string; status: CoachLinkRequest['status']; created_at: string }>
  const allIds = [...new Set([...ids, ...requestRows.map(item => item.athlete_id)])]
  let athletes: Array<{ id: string; first_name: string; last_name: string; email: string | null; user_id: string | null }> = []
  if (allIds.length) {
    const athletesResult = await supabase.from('athletes').select('id,first_name,last_name,email,user_id').in('id', allIds)
    if (athletesResult.error) throw athletesResult.error
    athletes = athletesResult.data ?? []
  }
  const byId = new Map(athletes.map(item => [item.id, item]))
  return {
    source: 'legacy-v1',
    athletes: relations.map(relation => {
      const row = byId.get(relation.athlete_id)
      const name = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || 'Atleta'
      return { id: relation.athlete_id, name, initials: initials(name), status: relation.status, email: row?.email ?? null, appAccessActive: Boolean(row?.user_id) }
    }),
    invitations: ((invitesResult.data ?? []) as Array<{ id: string; email: string; status: AthleteInvitation['status']; invited_at: string }>).map(invite => ({ id: invite.id, email: invite.email, status: invite.status, invitedAt: invite.invited_at })),
    linkRequests: requestRows.map(request => { const row = byId.get(request.athlete_id); return { id: request.id, athleteId: request.athlete_id, athleteName: [row?.first_name,row?.last_name].filter(Boolean).join(' ') || 'Atleta', status: request.status, createdAt: request.created_at } }),
  }
}

export async function createManagedAthlete(profile: AppProfile, firstName: string, lastName: string, email?: string) {
  if (!supabase || profile.userId.startsWith('00000000-')) return 'demo-athlete'
  const { data, error } = await supabase.rpc('create_managed_athlete', { p_first_name: firstName.trim(), p_last_name: lastName.trim(), p_email: email?.trim() || null })
  if (error) throw error
  return data as string
}

export async function inviteAthlete(profile: AppProfile, athleteId: string, rawEmail: string) {
  if (!supabase || profile.userId.startsWith('00000000-')) return { delivered: false }
  const email = normalizeEmail(rawEmail)
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Inserisci un indirizzo email valido.')
  const athleteResult = await supabase.from('athletes').update({ email }).eq('id', athleteId).select('id').single()
  if (athleteResult.error) throw athleteResult.error

  const existingResult = await supabase.from('athlete_invitations').select('id,status').eq('coach_id', profile.userId).eq('email_normalized', email).maybeSingle()
  if (existingResult.error) throw existingResult.error
  if (existingResult.data?.status === 'accepted') throw new Error('Questo atleta ha già accettato. Riattiva la relazione dall’elenco atleti.')

  if (existingResult.data) {
    const updateResult = await supabase.from('athlete_invitations').update({ ...buildInvitationPayload(athleteId, email), accepted_at: null, invited_at: new Date().toISOString() }).eq('id', existingResult.data.id).select('id').single()
    if (updateResult.error) throw updateResult.error
  } else {
    const insertResult = await supabase.from('athlete_invitations').insert({ coach_id: profile.userId, ...buildInvitationPayload(athleteId, email) }).select('id').single()
    if (insertResult.error) throw insertResult.error
  }

  const authResult = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` } })
  if (authResult.error) return { delivered: false, deliveryError: authResult.error.message }
  return { delivered: true }
}

export async function decideCoachLinkRequest(profile: AppProfile, requestId: string, accept: boolean) {
  if (!supabase || profile.userId.startsWith('00000000-')) return
  const { error } = await supabase.rpc('decide_coach_link_request', { p_request_id: requestId, p_accept: accept })
  if (error) throw error
}

export async function setAthleteStatus(profile: AppProfile, athleteId: string, status: 'active' | 'inactive') {
  if (!supabase || profile.userId.startsWith('00000000-')) return
  const result = await supabase.from('coach_athletes').update({ status }).eq('coach_id', profile.userId).eq('athlete_id', athleteId).select('athlete_id').single()
  if (result.error) throw result.error
}

export async function removeAthleteRelationship(profile: AppProfile, athleteId: string) {
  if (!supabase || profile.userId.startsWith('00000000-')) return
  const invitationResult = await supabase
    .from('athlete_invitations')
    .update({ status: 'revoked' })
    .eq('coach_id', profile.userId)
    .eq('athlete_id', athleteId)
    .eq('status', 'accepted')
  if (invitationResult.error) throw invitationResult.error

  const relationshipResult = await supabase
    .from('coach_athletes')
    .delete()
    .eq('coach_id', profile.userId)
    .eq('athlete_id', athleteId)
    .select('athlete_id')
    .single()
  if (relationshipResult.error) throw relationshipResult.error
}

export async function revokeInvitation(profile: AppProfile, invitationId: string) {
  if (!supabase || profile.userId.startsWith('00000000-')) return
  const result = await supabase.from('athlete_invitations').update({ status: 'revoked' }).eq('coach_id', profile.userId).eq('id', invitationId).select('id').single()
  if (result.error) throw result.error
}
