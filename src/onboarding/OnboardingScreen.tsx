import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, Dumbbell, KeyRound, Mountain, Users } from 'lucide-react'
import type { AppUser } from '../auth/AuthProvider'
import { completeOnboarding } from './profileRepository'
import type { AppProfile, AppRole, OnboardingInput, WorkspaceMode } from './types'
import { isOnboardingValid, validateOnboarding } from './validation'
import { dataRuntime } from '../dataRuntime'

export function OnboardingScreen({ user, onComplete, onSignOut }: { user: AppUser; onComplete: (profile: AppProfile) => void; onSignOut: () => Promise<void> }) {
  const isLegacyInvitation = dataRuntime.backendSchema === 'legacy-v1' && !user.isDemo
  const [step, setStep] = useState(1)
  const [input, setInput] = useState<OnboardingInput>({
    displayName: '',
    role: 'athlete',
    workspaceMode: 'personal',
    workspaceName: 'Il mio allenamento',
    invitationToken: '',
    birthDate: '',
    weightKg: '',
    heightCm: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const errors = useMemo(() => validateOnboarding(input), [input])
  const legacyDetailsValid = Boolean(input.birthDate) && Number(input.weightKg) >= 10 && Number(input.weightKg) <= 400 && Number(input.heightCm) >= 50 && Number(input.heightCm) <= 250
  const legacyNameValid = input.displayName.trim().split(/\s+/).length >= 2 && input.displayName.trim().length <= 120

  const selectRole = (role: AppRole) => {
    setInput(current => ({
      ...current,
      role,
      workspaceMode: role === 'coach' ? 'create' : 'personal',
      workspaceName: role === 'coach' ? 'Vertical Lab' : 'Il mio allenamento',
    }))
  }

  const selectWorkspaceMode = (workspaceMode: WorkspaceMode) => {
    setInput(current => ({ ...current, workspaceMode }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (step === 1) {
      if (isLegacyInvitation ? legacyNameValid : !errors.displayName) setStep(2)
      return
    }
    if (isLegacyInvitation ? !legacyDetailsValid : !isOnboardingValid(errors)) return
    setSubmitting(true)
    setSubmitError('')
    try {
      onComplete(await completeOnboarding(user, input))
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Onboarding non riuscito.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="onboarding-layout">
      <header className="onboarding-top"><div className="auth-brand__top"><span className="brand__mark"><Mountain size={22} /></span><b>CLIMBING COACH</b><em>SETUP</em></div><button className="text-button" onClick={() => void onSignOut()}>Esci</button></header>
      <form className="onboarding-card" onSubmit={submit}>
        <div className="onboarding-progress"><span className={step >= 1 ? 'active' : ''}>01</span><i className={step === 2 ? 'active' : ''} /><span className={step === 2 ? 'active' : ''}>02</span></div>

        {step === 1 ? (
          <div className="onboarding-step">
            <div className="eyebrow">PROFILO / 01</div>
            <h1>{isLegacyInvitation ? 'Completa il tuo profilo atleta.' : 'Come userai Climbing Coach?'}</h1>
            <p>{isLegacyInvitation ? 'Il tuo invito è stato riconosciuto dall’indirizzo email. Nome e cognome servono a collegarti correttamente al coach.' : 'Il ruolo definisce la tua prima area di lavoro. Potremo aggiungere altri coach o atleti in seguito.'}</p>
            <label className="field-label" htmlFor="display-name">{isLegacyInvitation ? 'Nome e cognome' : 'Come vuoi essere chiamato?'}</label>
            <input className="standalone-input" id="display-name" value={input.displayName} onChange={event => setInput(current => ({ ...current, displayName: event.target.value }))} placeholder={isLegacyInvitation ? 'Nome Cognome' : 'Stefano'} autoComplete="name" autoFocus />
            {isLegacyInvitation ? !legacyNameValid && input.displayName.length > 0 && <p className="form-error">Inserisci nome e cognome.</p> : errors.displayName && <p className="form-error">{errors.displayName}</p>}
            {!isLegacyInvitation && <div className="role-grid">
              <button type="button" className={`choice-card ${input.role === 'athlete' ? 'active' : ''}`} onClick={() => selectRole('athlete')} aria-pressed={input.role === 'athlete'}><Dumbbell size={25} /><b>Sono un atleta</b><span>Seguo programmi, registro sessioni e controllo i miei test.</span><i>{input.role === 'athlete' && <Check size={15} />}</i></button>
              <button type="button" className={`choice-card ${input.role === 'coach' ? 'active' : ''}`} onClick={() => selectRole('coach')} aria-pressed={input.role === 'coach'}><Users size={25} /><b>Sono un coach</b><span>Creo programmi e seguo il lavoro dei miei atleti.</span><i>{input.role === 'coach' && <Check size={15} />}</i></button>
            </div>}
            <button type="button" className="button button--signal button--wide" disabled={isLegacyInvitation ? !legacyNameValid : Boolean(errors.displayName)} onClick={() => setStep(2)}>Continua <ArrowRight size={17} /></button>
          </div>
        ) : (
          <div className="onboarding-step">
            <div className="eyebrow">WORKSPACE / 02</div>
            <h1>{isLegacyInvitation ? 'I dati utili al coach.' : input.role === 'coach' ? 'Crea il tuo spazio coach.' : 'Dove vuoi allenarti?'}</h1>
            <p>{isLegacyInvitation ? 'Questi valori completano il profilo e rendono confrontabili carichi e test. Potrai aggiornarli in seguito.' : 'Ogni dato appartiene a un workspace isolato. Un invito può collegarti in sicurezza al tuo coach.'}</p>

            {isLegacyInvitation ? <div className="profile-details-grid">
              <label><span>Data di nascita</span><input className="standalone-input" type="date" value={input.birthDate} onChange={event => setInput(current => ({ ...current, birthDate: event.target.value }))} required /></label>
              <label><span>Peso</span><div className="input-shell"><input type="number" min="10" max="400" step="0.1" value={input.weightKg} onChange={event => setInput(current => ({ ...current, weightKg: event.target.value }))} /><em>kg</em></div></label>
              <label><span>Altezza</span><div className="input-shell"><input type="number" min="50" max="250" step="0.1" value={input.heightCm} onChange={event => setInput(current => ({ ...current, heightCm: event.target.value }))} /><em>cm</em></div></label>
            </div> : <>{input.role === 'athlete' && <div className="workspace-modes">
              <button type="button" className={input.workspaceMode === 'personal' ? 'active' : ''} onClick={() => selectWorkspaceMode('personal')}><Dumbbell size={18} /><span><b>Spazio personale</b><small>Inizia senza un coach</small></span></button>
              <button type="button" className={input.workspaceMode === 'invitation' ? 'active' : ''} onClick={() => selectWorkspaceMode('invitation')}><KeyRound size={18} /><span><b>Ho un invito</b><small>Entra nel workspace del coach</small></span></button>
            </div>}

            {input.workspaceMode === 'invitation' ? <>
              <label className="field-label" htmlFor="invitation-token">Codice invito</label>
              <input className="standalone-input standalone-input--mono" id="invitation-token" value={input.invitationToken} onChange={event => setInput(current => ({ ...current, invitationToken: event.target.value }))} placeholder="CC-XXXX-XXXX" autoComplete="off" />
              {errors.invitationToken && <p className="form-error">{errors.invitationToken}</p>}
            </> : <>
              <label className="field-label" htmlFor="workspace-name">Nome workspace</label>
              <input className="standalone-input" id="workspace-name" value={input.workspaceName} onChange={event => setInput(current => ({ ...current, workspaceName: event.target.value }))} placeholder="Vertical Lab" />
              {errors.workspaceName && <p className="form-error">{errors.workspaceName}</p>}
            </>}</>}

            {submitError && <p className="form-error form-error--box" role="alert">{submitError}</p>}
            <div className="onboarding-actions"><button type="button" className="button button--secondary" onClick={() => setStep(1)}><ArrowLeft size={17} /> Indietro</button><button className="button button--signal" disabled={(isLegacyInvitation ? !legacyDetailsValid : !isOnboardingValid(errors)) || submitting}>{submitting ? 'Configurazione…' : isLegacyInvitation ? 'Accetta invito' : 'Completa configurazione'} <ArrowRight size={17} /></button></div>
          </div>
        )}
      </form>
      <footer className="onboarding-foot">ACCOUNT <b>{user.email}</b><span /> DATI {user.isDemo ? 'TEMPORANEI' : 'PROTETTI DA RLS'}</footer>
    </main>
  )
}
