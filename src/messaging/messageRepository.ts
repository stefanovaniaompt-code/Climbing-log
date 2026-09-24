import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'

export type Message = { id: string; coachId: string; athleteId: string; senderUserId: string; body: string; createdAt: string; readAt: string | null }
export type CoachOption = { id: string; name: string }
export const MESSAGES_READ_EVENT = 'cc-v2:messages-read'

const isDemo = (profile: AppProfile) => !supabase || profile.userId.startsWith('00000000-') || dataRuntime.backendSchema !== 'legacy-v1'
const mapMessage = (row: { id: string; coach_id: string; athlete_id: string; sender_user_id: string; body: string; created_at: string; read_at: string | null }): Message => ({ id: row.id, coachId: row.coach_id, athleteId: row.athlete_id, senderUserId: row.sender_user_id, body: row.body, createdAt: row.created_at, readAt: row.read_at })

export async function loadAthleteCoaches(profile: AppProfile): Promise<CoachOption[]> {
  if (isDemo(profile) || !profile.athleteId) return []
  const relations = await supabase!.from('coach_athletes').select('coach_id').eq('athlete_id', profile.athleteId).eq('status', 'active')
  if (relations.error) throw relations.error
  const ids = (relations.data ?? []).map(row => row.coach_id as string)
  if (!ids.length) return []
  const profiles = await supabase!.from('profiles').select('id,full_name').in('id', ids)
  if (profiles.error) throw profiles.error
  const names = new Map((profiles.data ?? []).map(row => [row.id as string, row.full_name as string]))
  return ids.map(id => ({ id, name: names.get(id) ?? 'Coach' }))
}

export async function loadConversation(profile: AppProfile, coachId: string, athleteId: string): Promise<Message[]> {
  if (isDemo(profile)) return []
  const result = await supabase!.from('messages').select('id,coach_id,athlete_id,sender_user_id,body,created_at,read_at').eq('coach_id', coachId).eq('athlete_id', athleteId).order('created_at', { ascending: true }).limit(250)
  if (result.error) throw result.error
  return (result.data ?? []).map(row => mapMessage(row as Parameters<typeof mapMessage>[0]))
}

export async function sendMessage(profile: AppProfile, coachId: string, athleteId: string, body: string): Promise<Message> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Scrivi un messaggio.')
  if (trimmed.length > 5000) throw new Error('Il messaggio è troppo lungo.')
  if (isDemo(profile)) return { id: crypto.randomUUID(), coachId, athleteId, senderUserId: profile.userId, body: trimmed, createdAt: new Date().toISOString(), readAt: null }
  const result = await supabase!.from('messages').insert({ coach_id: coachId, athlete_id: athleteId, sender_user_id: profile.userId, body: trimmed }).select('id,coach_id,athlete_id,sender_user_id,body,created_at,read_at').single()
  if (result.error) throw result.error
  return mapMessage(result.data as Parameters<typeof mapMessage>[0])
}

export async function markConversationRead(profile: AppProfile, coachId: string, athleteId: string) {
  if (isDemo(profile)) return
  const result = await supabase!.from('messages').update({ read_at: new Date().toISOString() }).eq('coach_id', coachId).eq('athlete_id', athleteId).neq('sender_user_id', profile.userId).is('read_at', null)
  if (result.error) throw result.error
  window.dispatchEvent(new Event(MESSAGES_READ_EVENT))
}

export async function loadUnreadCount(profile: AppProfile): Promise<number> {
  if (isDemo(profile)) return 0
  let query = supabase!.from('messages').select('id', { count: 'exact', head: true }).is('read_at', null).neq('sender_user_id', profile.userId)
  query = profile.role === 'coach' ? query.eq('coach_id', profile.userId) : query.eq('athlete_id', profile.athleteId ?? '')
  const result = await query
  if (result.error) throw result.error
  return result.count ?? 0
}

export function subscribeToMessages(profile: AppProfile, callback: (message: Message) => void, thread?: { coachId: string; athleteId: string }) {
  if (isDemo(profile)) return () => undefined
  const filter = thread ? `athlete_id=eq.${thread.athleteId}` : profile.role === 'coach' ? `coach_id=eq.${profile.userId}` : `athlete_id=eq.${profile.athleteId ?? ''}`
  const channel = supabase!.channel(`messages-${profile.userId}-${thread?.athleteId ?? 'all'}-${crypto.randomUUID()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, payload => {
    const message = mapMessage(payload.new as Parameters<typeof mapMessage>[0])
    if (!thread || message.coachId === thread.coachId) callback(message)
  }).subscribe()
  return () => { void supabase!.removeChannel(channel) }
}
