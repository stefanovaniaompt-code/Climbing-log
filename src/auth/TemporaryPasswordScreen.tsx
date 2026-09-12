import { useState, type FormEvent } from 'react'
import { Check, KeyRound, Mountain } from 'lucide-react'
import { useAuth } from './AuthProvider'
import {
  friendlyAuthError,
  validatePassword,
} from './password'

export function TemporaryPasswordScreen({
  onComplete,
}: {
  onComplete: () => void
}) {
  const { setPassword, signOut } = useAuth()

  const [password, setPasswordValue] =
    useState('')
  const [confirmation, setConfirmation] =
    useState('')
  const [state, setState] =
    useState<
      'idle' | 'saving' | 'saved' | 'error'
    >('idle')
  const [message, setMessage] =
    useState('')

  const submit = async (
    event: FormEvent,
  ) => {
    event.preventDefault()

    const validation =
      validatePassword(
        password,
        confirmation,
      )

    if (validation) {
      setState('error')
      setMessage(validation)
      return
    }

    setState('saving')
    setMessage('')

    try {
      await setPassword(password)
      setState('saved')
    } catch (error) {
      setState('error')
      setMessage(
        friendlyAuthError(
          error instanceof Error
            ? error.message
            : 'Password non aggiornata.',
        ),
      )
    }
  }

  return (
    <main className="auth-layout">
      <section
        className="auth-brand"
        aria-label="Climbing Coach"
      >
        <div className="auth-brand__top">
          <span className="brand__mark">
            <Mountain size={24} />
          </span>
          <b>
            CLIMBING
            <br />
            COACH
          </b>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="eyebrow">
            PRIMO ACCESSO / SICURO
          </div>

          <h2>
            Crea la tua password.
          </h2>

          <p>
            Hai effettuato il primo accesso tramite il link ricevuto via email.
            Crea ora una password personale per i prossimi accessi.
          </p>

          {state === 'saved' ? (
            <div
              className="auth-sent"
              role="status"
            >
              <Check size={22} />

              <div>
                <b>
                  Password personale attiva
                </b>
                <span>
                  Da ora puoi accedere con email e password oppure,
                  quando necessario, richiedere un nuovo link di accesso.
                </span>
              </div>

              <button
                className="button button--signal"
                onClick={onComplete}
              >
                Entra nell'app
              </button>
            </div>
          ) : (
            <form
              className="auth-form"
              onSubmit={submit}
            >
              <label htmlFor="temporary-new-password">
                Nuova password
              </label>

              <div className="auth-input">
                <KeyRound size={18} />
                <input
                  id="temporary-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={event =>
                    setPasswordValue(
                      event.target.value,
                    )
                  }
                  required
                />
              </div>

              <label htmlFor="temporary-confirm-password">
                Conferma password
              </label>

              <div className="auth-input">
                <KeyRound size={18} />
                <input
                  id="temporary-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={event =>
                    setConfirmation(
                      event.target.value,
                    )
                  }
                  required
                />
              </div>

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
                disabled={
                  state === 'saving'
                }
              >
                {state === 'saving'
                  ? 'Salvataggio…'
                  : 'Crea password personale'}
              </button>

              <button
                type="button"
                className="text-button"
                onClick={() =>
                  void signOut()
                }
              >
                Esci
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
