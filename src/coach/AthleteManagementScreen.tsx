import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, Mail, Plus, Search, ShieldCheck, SlidersHorizontal, TestTube2, Trash2, TriangleAlert, Users } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import { ConfirmDialog, Panel, ScreenHeader, Tag } from '../shared/ui'
import { createManagedAthlete, decideCoachLinkRequest, inviteAthlete, loadAthleteManagement, removeAthleteRelationship, resolveInvitationEmail, revokeInvitation, type AthleteManagementData } from './athleteManagementRepository'

type Props = { profile: AppProfile; selectedAthleteId: string; setSelectedAthleteId: (id: string) => void; openDashboard: () => void; openAthleteArea: (view: 'builder' | 'test', athleteId: string) => void }

export function AthleteManagementScreen({ profile, selectedAthleteId, setSelectedAthleteId, openDashboard, openAthleteArea }: Props) {
  const [data, setData] = useState<AthleteManagementData | null>(null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'saving'>('loading')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)

  const refresh = async () => {
    setState('loading'); setError('')
    try { setData(await loadAthleteManagement(profile)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Elenco atleti non disponibile.') }
    finally { setState('idle') }
  }
  useEffect(() => { void refresh() }, [profile])

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault(); setState('saving'); setError(''); setMessage('')
    try {
      if (!selectedAthleteId) throw new Error('Seleziona prima un atleta.')
      const savedEmail = data?.athletes.find(item => item.id === selectedAthleteId)?.email ?? ''
      const result = await inviteAthlete(profile, selectedAthleteId, resolveInvitationEmail(email, savedEmail))
      setMessage(result.delivered ? 'Invito registrato e link di accesso inviato.' : `Invito registrato. Invio email non confermato${result.deliveryError ? `: ${result.deliveryError}` : '.'}`)
      setEmail(''); setData(await loadAthleteManagement(profile))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invito non creato.') }
    finally { setState('idle') }
  }

  const submitAthlete = async (event: FormEvent) => {
    event.preventDefault(); setState('saving'); setError(''); setMessage('')
    try {
      const id = await createManagedAthlete(profile, firstName, lastName, email)
      setFirstName(''); setLastName(''); setEmail('')
      setMessage('Atleta creato. Puoi già aprire il profilo e preparare programma e test.')
      setData(await loadAthleteManagement(profile)); setSelectedAthleteId(id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Atleta non creato.') }
    finally { setState('idle') }
  }

  const decideRequest = async (id: string, accept: boolean) => {
    setState('saving'); setError(''); setMessage('')
    try {
      await decideCoachLinkRequest(profile, id, accept)
      setMessage(accept ? 'Richiesta accettata: atleta collegato.' : 'Richiesta rifiutata.')
      setData(await loadAthleteManagement(profile))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Richiesta non aggiornata.') }
    finally { setState('idle') }
  }

  const revoke = async (id: string) => {
    setState('saving'); setError(''); setMessage('')
    try { await revokeInvitation(profile, id); setMessage('Invito revocato senza cancellare alcun dato.'); setData(await loadAthleteManagement(profile)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Invito non revocato.') }
    finally { setState('idle') }
  }

  const removeAthlete = async () => {
    if (!removeTarget) return
    setState('saving'); setError(''); setMessage('')
    try {
      await removeAthleteRelationship(profile, removeTarget.id)
      setSelectedAthleteId(''); setRemoveTarget(null)
      setMessage('Collegamento rimosso. Profilo, allenamenti completati, log esercizi e test dell’atleta sono rimasti intatti.')
      setData(await loadAthleteManagement(profile))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Atleta non rimosso.') }
    finally { setState('idle') }
  }

  const selectedAthlete = data?.athletes.find(item => item.id === selectedAthleteId)
  const filteredAthletes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('it-IT')
    return normalized ? (data?.athletes ?? []).filter(athlete => athlete.name.toLocaleLowerCase('it-IT').includes(normalized)) : (data?.athletes ?? [])
  }, [data?.athletes, query])

  if (selectedAthlete) return (
    <div className="screen athlete-detail-screen">
      <button className="back-button" onClick={() => { setSelectedAthleteId(''); openDashboard() }}><ArrowLeft size={17} /> Torna alla dashboard coach</button>
      <ScreenHeader eyebrow="COACH / DETTAGLIO ATLETA" title={selectedAthlete.name} text="Programma, test e accesso atleta." action={<Tag tone={selectedAthlete.status === 'active' ? 'success' : 'warning'}>{selectedAthlete.status}</Tag>} />
      <div className="athlete-detail-grid">
        <button className="athlete-action-card" onClick={() => openAthleteArea('builder', selectedAthlete.id)}><SlidersHorizontal size={22} /><span><b>Programma di esercizi</b><small>Apri schede, settimane, sessioni e parametri.</small></span><ArrowRight size={18} /></button>
        <button className="athlete-action-card" onClick={() => openAthleteArea('test', selectedAthlete.id)}><TestTube2 size={22} /><span><b>Test e progressi</b><small>Consulta lo storico o registra una nuova rilevazione.</small></span><ArrowRight size={18} /></button>
      </div>
      <Panel title="Gestione collegamento" index="03"><div className="relationship-actions"><div><b>Rimuovi atleta dal coach</b><p>Viene eliminato solo il collegamento. L’account dell’atleta e tutto il suo storico restano nel database.</p></div><button className="button button--danger" disabled={state === 'saving'} onClick={() => setRemoveTarget({ id: selectedAthlete.id, name: selectedAthlete.name })}><Trash2 size={16} /> Rimuovi atleta</button></div></Panel>
      <Panel title="Accesso app" index="04">{selectedAthlete.appAccessActive ? <div className="completion-banner"><Check size={19} /><div><b>Accesso app attivo</b><span>L’account è collegato a questa identità atleta.</span></div></div> : <form className="invite-form" onSubmit={submitInvite}><b>Accesso app non attivo</b><label><span>Email atleta</span><input className="standalone-input" type="email" value={email || selectedAthlete.email || ''} onChange={event => setEmail(event.target.value)} required /></label><button className="button button--signal" disabled={state === 'saving'}><Mail size={16} /> Invita alla app</button></form>}</Panel>
      {error && <StatusMessage error>{error}</StatusMessage>}{message && <StatusMessage>{message}</StatusMessage>}
      {removeTarget && <ConfirmDialog title={`Rimuovere ${removeTarget.name}?`} text="Perderai l’accesso coach ai suoi dati finché non verrà collegato di nuovo. Profilo, allenamenti completati, esercizi registrati e test non saranno cancellati." confirmLabel="Rimuovi atleta" busy={state === 'saving'} onCancel={() => setRemoveTarget(null)} onConfirm={() => void removeAthlete()} />}
    </div>
  )

  return (
    <div className="coach-athletes">
      <header className="coach-athletes__intro"><p className="coach-kicker">// PEOPLE</p><h1>ATLETI <span aria-hidden="true" /></h1><p>Gestione degli atleti e accesso ai relativi percorsi.</p></header>
      <label className="coach-athletes__search"><Search size={17} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cerca atleta..." /></label>
      <section className="coach-athletes__list" aria-label="Atleti collegati">
        {state === 'loading' && !data && <div className="coach-athletes__loading">Caricamento atleti…</div>}
        {data && filteredAthletes.length === 0 && <div className="coach-athletes__empty"><Users size={24} /><b>{query ? 'Nessun atleta trovato' : 'Nessun atleta collegato'}</b><span>{query ? 'Prova con un altro nome.' : 'Crea il primo profilo usando il modulo qui sotto.'}</span></div>}
        {filteredAthletes.map(athlete => <article className="coach-athlete-row" key={athlete.id}>
          <div className="coach-athlete-row__identity"><span className="coach-athlete-row__avatar">{athlete.initials}</span><div><h2>{athlete.name}</h2><div className="coach-athlete-row__tags"><span>{athlete.status === 'active' ? 'ATTIVO' : athlete.status === 'pending' ? 'IN ATTESA' : 'SOSPESO'}</span><span>{athlete.appAccessActive ? 'ACCESSO APP' : 'ACCESSO DA ATTIVARE'}</span></div></div></div>
          <DataCell label="PROGRAMMA" value={athlete.status === 'active' ? 'ATTIVO' : 'NON ATTIVO'} />
          <DataCell label="ACCOUNT" value={athlete.appAccessActive ? 'COLLEGATO' : 'DA INVITARE'} />
          <button className="coach-athlete-row__open" onClick={() => { setEmail(athlete.email ?? ''); setSelectedAthleteId(athlete.id) }}>VEDI PROGRESSI <ArrowRight size={16} /></button>
        </article>)}
      </section>
      <div className="coach-athletes__management">
        <Panel title="Aggiungi nuovo atleta" index="01"><form className="invite-form" onSubmit={submitAthlete}><label><span>Nome *</span><input className="standalone-input" value={firstName} onChange={event => setFirstName(event.target.value)} required /></label><label><span>Cognome *</span><input className="standalone-input" value={lastName} onChange={event => setLastName(event.target.value)} required /></label><label><span>Email (facoltativa)</span><input className="standalone-input" type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><p>L’atleta viene creato subito. L’invito alla app resta un’azione separata.</p><button className="button button--signal button--wide" disabled={state === 'saving'}><Plus size={16} /> {state === 'saving' ? 'Creazione…' : 'Crea atleta'}</button></form></Panel>
        <Panel title="Storico inviti" index="02">{data?.invitations.length === 0 && <div className="empty-state empty-state--compact"><Mail size={20} /><b>Nessun invito</b><span>Gli inviti inviati compariranno qui.</span></div>}<div className="invitation-list">{data?.invitations.map(invite => <div className="invitation-row" key={invite.id}><div><b>{invite.email}</b><small>{new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(invite.invitedAt))}</small></div><Tag tone={invite.status === 'accepted' ? 'success' : invite.status === 'pending' ? 'signal' : 'warning'}>{invite.status}</Tag>{invite.status === 'pending' ? <button className="text-button" disabled={state === 'saving'} onClick={() => void revoke(invite.id)}>Revoca</button> : <span />}</div>)}</div></Panel>
        <Panel title="Richieste di collegamento" index="03">{data?.linkRequests.filter(request => request.status === 'pending').length === 0 && <div className="empty-state empty-state--compact"><Users size={20} /><b>Nessuna richiesta</b></div>}<div className="invitation-list">{data?.linkRequests.filter(request => request.status === 'pending').map(request => <div className="invitation-row" key={request.id}><div><b>{request.athleteName}</b><small>Richiesta atleta</small></div><button className="button button--secondary" disabled={state === 'saving'} onClick={() => void decideRequest(request.id, false)}>Rifiuta</button><button className="button button--signal" disabled={state === 'saving'} onClick={() => void decideRequest(request.id, true)}>Accetta</button></div>)}</div></Panel>
      </div>
      {error && <StatusMessage error>{error}</StatusMessage>}{message && <StatusMessage>{message}</StatusMessage>}
    </div>
  )
}

function DataCell({ label, value }: { label: string; value: string }) { return <div className="coach-athlete-row__data"><span>{label}</span><b>{value}</b></div> }
function StatusMessage({ children, error = false }: { children: string; error?: boolean }) { return <div className={`completion-banner${error ? ' completion-banner--error' : ''}`}>{error ? <TriangleAlert size={19} /> : <ShieldCheck size={19} />}<div><b>{error ? 'Operazione non completata' : 'Operazione confermata'}</b><span>{children}</span></div></div> }
