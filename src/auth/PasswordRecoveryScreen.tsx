import { useState, type FormEvent } from 'react'
import { Check, KeyRound, Mountain } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { friendlyAuthError, validatePassword } from './password'

export function PasswordRecoveryScreen() {
  const { recoveryMode, setPassword, signOut } = useAuth()
  const [password, setPasswordValue] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validation = validatePassword(password, confirmation)
    if (validation) { setState('error'); setMessage(validation); return }
    if (!recoveryMode) { setState('error'); setMessage('Il link non è valido, è scaduto oppure è già stato usato. Richiedine uno nuovo.'); return }
    setState('saving'); setMessage('')
    try { await setPassword(password); setState('saved') }
    catch (error) { setState('error'); setMessage(friendlyAuthError(error instanceof Error ? error.message : 'Password non aggiornata.')) }
  }

  return <main className="auth-layout"><section className="auth-brand" aria-label="Climbing Coach"><div className="auth-brand__top"><span className="brand__mark"><Mountain size={24} /></span><b>CLIMBING<br />COACH</b></div></section><section className="auth-panel"><div className="auth-card"><div className="eyebrow">RECOVERY / SICURO</div><h2>Nuova password.</h2><p>Imposta una password di almeno 8 caratteri, con una lettera e un numero.</p>{state === 'saved' ? <div className="auth-sent" role="status"><Check size={22} /><div><b>Password aggiornata</b><span>Ora puoi tornare all’accesso e usare la nuova password.</span></div><button className="button button--signal" onClick={() => void signOut()}>Torna all’accesso</button></div> : <form className="auth-form" onSubmit={submit}><label htmlFor="new-password">Nuova password</label><div className="auth-input"><KeyRound size={18} /><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={event => setPasswordValue(event.target.value)} required /></div><label htmlFor="confirm-password">Conferma password</label><div className="auth-input"><KeyRound size={18} /><input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></div>{state === 'error' && <p className="form-error" role="alert">{message}</p>}<button className="button button--signal button--wide" disabled={state === 'saving'}>{state === 'saving' ? 'Salvataggio…' : 'Aggiorna password'}</button></form>}</div></section></main>
}
