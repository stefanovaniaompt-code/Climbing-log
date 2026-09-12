import { useState, type FormEvent } from 'react'
import { ArrowRight, Check, KeyRound, Mail, Mountain, ShieldCheck } from 'lucide-react'
import { dataRuntime } from '../dataRuntime'
import { useAuth } from './AuthProvider'
import { friendlyAuthError } from './password'

type AuthMode = 'login' | 'forgot'
type LoginMethod = 'password' | 'link'

export function AuthScreen() {
  const {
    configured,
    enterDemo,
    requestPasswordReset,
    sendMagicLink,
    signInWithPassword,
  } = useAuth()

  const usesLegacyBackend =
    dataRuntime.backendSchema === 'legacy-v1'

  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [method, setMethod] =
    useState<LoginMethod>('password')
  const [state, setState] =
    useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const resetMessages = () => {
    setState('idle')
    setMessage('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    const normalizedEmail =
      email.trim().toLowerCase()

    if (!normalizedEmail) return

    setState('sending')
    setMessage('')

    try {
      if (mode === 'forgot') {
        await requestPasswordReset(normalizedEmail)
        setState('sent')
        return
      }

      if (method === 'password') {
        await signInWithPassword(
          normalizedEmail,
          password,
        )
        return
      }

      await sendMagicLink(normalizedEmail)
      setState('sent')
    } catch (error) {
      setState('error')
      setMessage(
        friendlyAuthError(
          error instanceof Error
            ? error.message
            : 'Accesso non riuscito.',
        ),
      )
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-brand" aria-label="Climbing Coach">
        <div className="auth-brand__top">
          <span className="brand__mark">
            <Mountain size={24} />
          </span>
          <b>CLIMBING<br />COACH</b>
        </div>

        <div className="auth-brand__statement">
          <span>SESSION_ READY</span>
          <h1>
            Il tuo allenamento.
            <br />
            Una decisione alla volta.
          </h1>
          <p>
            Programmi, sessioni e test nello stesso spazio operativo.
          </p>
        </div>

        <div className="auth-proof">
          <ShieldCheck size={19} />
          <div>
            <b>Accesso collegato al tuo profilo</b>
            <span>
              L account atleta viene creato o abilitato tramite il coach,
              evitando profili duplicati.
            </span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="eyebrow">
            ACCESSO / SICURO
          </div>

          <h2>
            {mode === 'forgot'
              ? 'Recupera la password.'
              : 'Bentornato.'}
          </h2>

          <p>
            {mode === 'forgot'
              ? 'Ti invieremo le istruzioni senza confermare se l indirizzo è registrato.'
              : method === 'password'
                ? 'Accedi con l email associata al tuo profilo e la tua password.'
                : 'Usa il link se il coach ti ha appena invitato o se non hai ancora impostato una password.'}
          </p>

          {usesLegacyBackend && (
            <div className="auth-existing-only">
              <ShieldCheck size={18} />
              <div>
                <b>Nessuna registrazione separata</b>
                <span>
                  Se sei un nuovo atleta usa l invito ricevuto dal coach.
                  Se eri già registrato usa la stessa email di sempre:
                  programmi, allenamenti e test rimangono collegati.
                </span>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <div
              className="auth-method-switch"
              role="tablist"
              aria-label="Metodo di accesso"
            >
              <button
                type="button"
                role="tab"
                aria-selected={method === 'password'}
                className={method === 'password' ? 'active' : ''}
                onClick={() => {
                  setMethod('password')
                  resetMessages()
                }}
              >
                <KeyRound size={15} />
                Password
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={method === 'link'}
                className={method === 'link' ? 'active' : ''}
                onClick={() => {
                  setMethod('link')
                  resetMessages()
                }}
              >
                <Mail size={15} />
                Primo accesso
              </button>
            </div>
          )}

          {state === 'sent' ? (
            <div className="auth-sent" role="status">
              <Check size={22} />
              <div>
                <b>Controlla la posta</b>
                <span>
                  {mode === 'forgot'
                    ? 'Se l indirizzo è associato a un account, riceverai una mail con le istruzioni.'
                    : 'Se esiste un account già creato o invitato per questa email, riceverai il link di accesso. Aprilo sul dispositivo su cui vuoi usare l app.'}
                </span>
              </div>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="auth-form"
            >
              <label htmlFor="auth-email">
                Email
              </label>

              <div className="auth-input">
                <Mail size={18} />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={event =>
                    setEmail(event.target.value)
                  }
                  placeholder="nome@email.it"
                  required
                />
              </div>

              {mode === 'login' &&
                method === 'password' && (
                  <>
                    <label htmlFor="auth-password">
                      Password
                    </label>

                    <div className="auth-input">
                      <KeyRound size={18} />
                      <input
                        id="auth-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={event =>
                          setPassword(event.target.value)
                        }
                        placeholder="La tua password"
                        required
                      />
                    </div>

                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setMode('forgot')
                        resetMessages()
                      }}
                    >
                      Password dimenticata?
                    </button>
                  </>
                )}

              {state === 'error' && (
                <p
                  className="form-error"
                  role="alert"
                >
                  {message}
                </p>
              )}

              <button
                className="button button--signal button--wide"
                disabled={state === 'sending'}
              >
                {state === 'sending'
                  ? 'Attendi...'
                  : mode === 'forgot'
                    ? 'Invia istruzioni'
                    : method === 'password'
                      ? 'Accedi'
                      : 'Invia link di primo accesso'}
                <ArrowRight size={17} />
              </button>

              {mode === 'forgot' && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setMode('login')
                    resetMessages()
                  }}
                >
                  Torna all accesso
                </button>
              )}
            </form>
          )}

          {!configured && (
            <div className="demo-access">
              <span>SUPABASE NON COLLEGATO</span>
              <p>
                Esplora Auth, onboarding e ruoli senza salvare dati reali.
              </p>
              <button
                className="button button--secondary button--wide"
                onClick={enterDemo}
              >
                Entra nella demo
                <ArrowRight size={17} />
              </button>
            </div>
          )}

          <small className="auth-help">
            Non hai ancora una password? Usa il link di primo accesso
            ricevuto dopo l invito del coach. Non creare un secondo account.
          </small>
        </div>
      </section>
    </main>
  )
}
