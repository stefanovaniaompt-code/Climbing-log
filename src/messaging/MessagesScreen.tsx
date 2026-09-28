import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import { loadAthleteCoaches, type CoachOption } from './messageRepository'
import { MessageThread } from './MessageThread'

export function MessagesScreen({ profile }: { profile: AppProfile }) {
  const [coaches, setCoaches] = useState<CoachOption[]>([]); const [coachId, setCoachId] = useState(''); const [error, setError] = useState('')
  useEffect(() => { let active = true; loadAthleteCoaches(profile).then(value => { if (!active) return; setCoaches(value); setCoachId(current => current || value[0]?.id || '') }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Coach non disponibile.') }); return () => { active = false } }, [profile])
  const coach = coaches.find(item => item.id === coachId)
  return <div className="athlete-chat"><header><small>COACH</small><h1>Messaggi.</h1><p>La conversazione diretta con il tuo coach.</p></header>{coaches.length > 1 && <label className="message-coach-select"><span>Coach</span><select value={coachId} onChange={event => setCoachId(event.target.value)}>{coaches.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}{error && <div className="athlete-chat__state is-error"><MessageCircle size={22} /><b>Conversazione non disponibile</b><span>{error}</span></div>}{!coach && !error && <div className="athlete-chat__state"><MessageCircle size={24} /><b>Nessun coach collegato</b><span>La conversazione sarà disponibile con una relazione attiva.</span></div>}{coach && profile.athleteId && <section className="athlete-card athlete-chat__thread"><MessageThread profile={profile} coachId={coach.id} athleteId={profile.athleteId} counterpartName={coach.name} /></section>}</div>
}
