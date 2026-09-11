import { useState, type FormEvent } from 'react'
import { Check, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { friendlyAuthError, validatePassword } from '../../auth/password'
import { requestCoachLink } from '../../coach/coachLinkRepository'
import type { AppProfile } from '../../onboarding/types'
import { Panel, ScreenHeader, Tag } from '../../shared/ui'

export function AccountSecurityScreen({ profile }: { profile: AppProfile }) {
  const { user, setPassword } = useAuth()
  const [password, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  const [coachEmail, setCoachEmail] = useState('')
  const [linkMessage, setLinkMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validatePassword(password, confirmation)
    if (validationError) { setError(validationError); return }
    setState('saving'); setError('')
    try {
      await setPassword(password)
      setNewPassword(''); setConfirmation(''); setState('saved')
    } catch (reason) {
      setError(friendlyAuthError(reason instanceof Error ? reason.message : 'Password non aggiornata.'))
      setState('idle')
    }
  }

  const submitCoachLink = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLinkMessage(''); setState('saving')
    try { const result = await requestCoachLink(profile, coachEmail); setLinkMessage(result === 'active' ? 'Sei già collegato a questo coach.' : 'Richiesta inviata. Il collegamento sarà attivo dopo l’accettazione del coach.'); setCoachEmail('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Richiesta non inviata.') } finally { setState('idle') }
  }

  return <div className="screen account-screen">
    <ScreenHeader eyebrow="ACCOUNT / SICUREZZA" title="Accedi da ogni dispositivo." text="La tua email è il nome utente. Crea una password personale: l’account e tutti i dati già presenti restano gli stessi." action={<Tag tone="success">Account protetto</Tag>} />
    <div className="grid grid--2-1">
      <Panel title="Imposta password" index="01">
        <form className="account-password-form" onSubmit={submit}>
          <label><span>Nome utente</span><div className="account-identity"><Mail size={17} /><b>{user?.email || 'Account demo'}</b></div></label>
          <label><span>Nuova password</span><div className="auth-input"><KeyRound size={17} /><input type="password" autoComplete="new-password" value={password} onChange={event => setNewPassword(event.target.value)} placeholder="Almeno 8 caratteri" required /></div></label>
          <label><span>Ripeti password</span><div className="auth-input"><KeyRound size={17} /><input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Ripeti la password" required /></div></label>
          {error && <p className="form-error form-error--box" role="alert">{error}</p>}
          <button className="button button--signal button--wide" disabled={state === 'saving'}><ShieldCheck size={17} /> {state === 'saving' ? 'Salvataggio…' : 'Salva password'}</button>
        </form>
        {state === 'saved' && <div className="completion-banner"><Check size={19} /><div><b>Password attiva</b><span>Ora puoi accedere da telefono, tablet o altro computer usando email e password.</span></div></div>}
      </Panel>
      <Panel title="Come funziona" index="02">
        <ol className="account-steps"><li><b>01</b><span>Imposta qui la password una sola volta.</span></li><li><b>02</b><span>Esci dall’app quando vuoi cambiare account.</span></li><li><b>03</b><span>Su ogni dispositivo usa la stessa email e la password scelta.</span></li></ol>
        <div className="safety-note"><ShieldCheck size={20} /><div><b>Nessuna migrazione account</b><p>Non viene creato un nuovo utente: cambiamo soltanto il metodo di accesso allo stesso profilo Supabase.</p></div></div>
      </Panel>
      {profile.capabilities.canAccessAthleteArea && <Panel title="Collegati a un coach" index="03"><form className="account-password-form" onSubmit={submitCoachLink}><label><span>Email del coach</span><div className="auth-input"><Mail size={17} /><input type="email" value={coachEmail} onChange={event => setCoachEmail(event.target.value)} placeholder="coach@email.it" required /></div></label><p>Il coach dovrà accettare la richiesta prima di vedere e gestire i tuoi dati.</p><button className="button button--secondary button--wide" disabled={state === 'saving'}>Invia richiesta</button></form>{linkMessage && <div className="completion-banner"><Check size={19} /><div><b>Richiesta registrata</b><span>{linkMessage}</span></div></div>}</Panel>}
    </div>
  </div>
}
