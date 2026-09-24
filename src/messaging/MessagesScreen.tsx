import { useEffect, useState } from 'react'
import type { AppProfile } from '../onboarding/types'
import { Panel, ScreenHeader } from '../shared/ui'
import { loadAthleteCoaches, type CoachOption } from './messageRepository'
import { MessageThread } from './MessageThread'

export function MessagesScreen({ profile }: { profile: AppProfile }) {
  const [coaches, setCoaches] = useState<CoachOption[]>([]); const [coachId, setCoachId] = useState(''); const [error, setError] = useState('')
  useEffect(() => { let active = true; loadAthleteCoaches(profile).then(value => { if (!active) return; setCoaches(value); setCoachId(current => current || value[0]?.id || '') }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Coach non disponibile.') }); return () => { active = false } }, [profile])
  const coach = coaches.find(item => item.id === coachId)
  return <div className="screen"><ScreenHeader eyebrow="MESSAGGI" title="Messaggi" text="Conversazione diretta con il coach." />{coaches.length > 1 && <label className="message-coach-select"><span>Coach</span><select value={coachId} onChange={event => setCoachId(event.target.value)}>{coaches.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}{error && <p className="form-error form-error--box">{error}</p>}{!coach && !error && <div className="empty-state"><b>Nessun coach collegato</b><span>La conversazione sarà disponibile con una relazione attiva.</span></div>}{coach && profile.athleteId && <Panel title="Conversazione" index="01"><MessageThread profile={profile} coachId={coach.id} athleteId={profile.athleteId} counterpartName={coach.name} /></Panel>}</div>
}
