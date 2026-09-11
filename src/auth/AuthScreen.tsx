import { useState, type FormEvent } from 'react'
import { ArrowRight, Check, KeyRound, Mail, Mountain, ShieldCheck } from 'lucide-react'
import { dataRuntime } from '../dataRuntime'
import { useAuth } from './AuthProvider'
import { friendlyAuthError } from './password'

type AuthMode = 'login' | 'signup' | 'forgot'
type LoginMethod = 'password' | 'link'

export function AuthScreen() {
  const { configured, enterDemo, requestPasswordReset, sendMagicLink, signInWithPassword } = useAuth()
  const usesLegacyBackend = dataRuntime.backendSchema === 'legacy-v1'
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [method, setMethod] = useState<LoginMethod>('password')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim()) return
    setState('sending')
    setMessage('')
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email.trim())
        setState('sent')
      } else if (method === 'password' && mode === 'login') {
        await signInWithPassword(email.trim(), password)
      } else {
        await sendMagicLink(email.trim(), mode === 'signup')
        setState('sent')
      }
    } catch (error) {
      setState('error')
      setMessage(friendlyAuthError(error instanceof Error ? error.message : 'Accesso non riuscito.'))
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-brand" aria-label="Climbing Coach">
        <div className="auth-brand__top"><span className="brand__mark"><Mountain size={24} /></span><b>CLIMBING<br />COACH</b></div>
        <div className="auth-brand__statement">
          <span>SESSION_ READY</span>
          <h1>Il tuo allenamento.<br />Una decisione alla volta.</h1>
          <p>Programmi, sessioni e test nello stesso spazio operativo.</p>
        </div>
        <div className="auth-proof"><ShieldCheck size={19} /><div><b>Dati separati per workspace</b><span>Accesso verificato nel database, non solo nell’interfaccia.</span></div></div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="eyebrow">ACCESSO / SICURO</div>
          <h2>{mode === 'forgot' ? 'Recupera la password.' : mode === 'login' ? 'Bentornato.' : 'Crea il tuo accesso.'}</h2>
          <p>{mode === 'forgot' ? 'Ti invieremo le istruzioni senza confermare se l’indirizzo è registrato.' : method === 'password' && mode === 'login' ? 'Accedi da qualsiasi dispositivo usando email e password.' : 'Il link serve per il primo accesso o per recuperare l’account.'}</p>

          {usesLegacyBackend && <div className="auth-existing-only"><ShieldCheck size={18} /><div><b>Account e dati invariati</b><span>L’email già registrata è il tuo nome utente. Programmi, allenamenti e test restano collegati allo stesso account.</span></div></div>}
          {mode !== 'forgot' && <div className="auth-tabs" role="tablist" aria-label="Tipo di accesso">
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setState('idle') }}>Accedi</button>
            <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setState('idle') }}>Crea account atleta</button>
          </div>}

          {mode === 'login' && <div className="auth-method-switch" role="tablist" aria-label="Metodo di accesso"><button type="button" role="tab" aria-selected={method === 'password'} className={method === 'password' ? 'active' : ''} onClick={() => { setMethod('password'); setState('idle') }}><KeyRound size={15} /> Password</button><button type="button" role="tab" aria-selected={method === 'link'} className={method === 'link' ? 'active' : ''} onClick={() => { setMethod('link'); setState('idle') }}><Mail size={15} /> Primo accesso</button></div>}

          {state === 'sent' ? (
            <div className="auth-sent" role="status"><Check size={22} /><div><b>Controlla la posta</b><span>{mode === 'forgot' ? 'Se l’indirizzo è associato a un account, riceverai una mail con le istruzioni.' : 'Apri il link sul dispositivo su cui vuoi usare l’app. Poi crea la password definitiva nelle Impostazioni.'}</span></div></div>
          ) : (
            <form onSubmit={submit} className="auth-form">
              <label htmlFor="auth-email">Email</label>
              <div className="auth-input"><Mail size={18} /><input id="auth-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nome@email.it" required /></div>
              {method === 'password' && mode === 'login' && <><label htmlFor="auth-password">Password</label><div className="auth-input"><KeyRound size={18} /><input id="auth-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="La tua password" required /></div><button type="button" className="text-button" onClick={() => { setMode('forgot'); setState('idle'); setMessage('') }}>Password dimenticata?</button></>}
              {state === 'error' && <p className="form-error" role="alert">{message}</p>}
              <button className="button button--signal button--wide" disabled={state === 'sending'}>{state === 'sending' ? 'Attendi…' : mode === 'forgot' ? 'Invia istruzioni' : method === 'password' && mode === 'login' ? 'Accedi' : mode === 'signup' ? 'Crea account atleta' : 'Invia link di primo accesso'} <ArrowRight size={17} /></button>
              {mode === 'forgot' && <button type="button" className="text-button" onClick={() => { setMode('login'); setState('idle'); setMessage('') }}>Torna all’accesso</button>}
            </form>
          )}

          {!configured && (
            <div className="demo-access">
              <span>SUPABASE NON COLLEGATO</span>
              <p>Esplora Auth, onboarding e ruoli senza salvare dati reali.</p>
              <button className="button button--secondary button--wide" onClick={enterDemo}>Entra nella demo <ArrowRight size={17} /></button>
            </div>
          )}
          <small className="auth-help">Non hai ancora una password? Usa una volta il link di primo accesso, poi creala nelle Impostazioni dell’app.</small>
        </div>
      </section>
    </main>
  )
}
