import {
  useEffect,
  useState,
  type FormEvent,
} from 'react'
import {
  ArrowRight,
  Plus,
  Save,
  ShieldCheck,
  TestTube2,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import {
  ConfirmDialog,
  Panel,
  ScreenHeader,
  Tag,
} from '../shared/ui'
import {
  validateTest,
  type TestData,
  type TestInput,
  type TestMetricInput,
  type TestSessionRecord,
} from './testAnalytics'
import {
  createTest,
  deleteTest,
  loadTests,
} from './testRepository'
import { RemoteTestPanel } from './RemoteTestPanel'
import {
  buildRetestInput,
  buildTestPresentation,
  canManageTests,
  sessionMeasureCount,
  testCaptureSourceLabel,
  type MetricSideBundle,
} from './testPresentation'

const createMetricInput = (
  side: TestMetricInput['side'] = 'bilateral',
): TestMetricInput => ({
  metricKey: 'peak_force',
  metricLabel: 'Forza picco',
  value: Number.NaN,
  unit: 'kg',
  side,
  grip: '20 mm',
  normalizeToBodyWeight: true,
  setup: {},
  notes: '',
})

const createTestInput = (
  athleteId = '',
): TestInput => ({
  athleteId,
  testedAt: new Date().toISOString().slice(0, 10),
  bodyWeightKg: null,
  protocolVersion: 'BLOCK-LIFT-20-V1',
  context: { posture: 'seated' },
  notes: '',
  metrics: [
    createMetricInput('right'),
    createMetricInput('left'),
  ],
})

function formatTestDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
  }).format(new Date(`${value}T12:00:00`))
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T12:00:00`))
}

function formattedValue(
  value: number | null | undefined,
) {
  return value === null || value === undefined
    ? '-'
    : value.toLocaleString('it-IT', {
        maximumFractionDigits: 2,
      })
}

function comparisonDelta(
  comparison: MetricSideBundle['left'],
) {
  if (!comparison || comparison.delta === null) return null

  return `${comparison.delta >= 0 ? '+' : ''}${comparison.delta.toLocaleString(
    'it-IT',
    { maximumFractionDigits: 2 },
  )}${comparison.percent === null
    ? ''
    : ` / ${comparison.percent >= 0 ? '+' : ''}${comparison.percent.toLocaleString(
        'it-IT',
        { maximumFractionDigits: 1 },
      )}%`}`
}

function MetricGroupCard({
  group,
  asymmetry,
}: {
  group: MetricSideBundle
  asymmetry:
    | ReturnType<typeof buildTestPresentation>['asymmetries'][number]
    | undefined
}) {
  const values = group.points.flatMap(point =>
    [point.left, point.right, point.bilateral]
      .filter(
        (value): value is number =>
          value !== null,
      )
      .map(value => Math.abs(value)),
  )

  const maximum = Math.max(...values, 1)

  return (
    <Panel
      className="test-paired-card"
      title={group.label}
      index="T"
      action={
        <Tag tone="purple">
          {group.grip || 'Setup standard'}
        </Tag>
      }
    >
      <div className="test-paired-values">
        {group.right && (
          <div>
            <small>DX</small>
            <strong>
              {formattedValue(group.right.latest)}
              <span> {group.unit}</span>
            </strong>
            {comparisonDelta(group.right) && (
              <em>{comparisonDelta(group.right)}</em>
            )}
          </div>
        )}

        {group.left && (
          <div>
            <small>SX</small>
            <strong>
              {formattedValue(group.left.latest)}
              <span> {group.unit}</span>
            </strong>
            {comparisonDelta(group.left) && (
              <em>{comparisonDelta(group.left)}</em>
            )}
          </div>
        )}

        {group.bilateral && (
          <div>
            <small>BILATERALE</small>
            <strong>
              {formattedValue(group.bilateral.latest)}
              <span> {group.unit}</span>
            </strong>
            {comparisonDelta(group.bilateral) && (
              <em>{comparisonDelta(group.bilateral)}</em>
            )}
          </div>
        )}
      </div>

      <div
        className="test-paired-chart"
        aria-label={`Storico ${group.label}`}
      >
        {group.points.map(point => (
          <div
            className="test-paired-chart__point"
            key={point.date}
          >
            <div className="test-paired-chart__bars">
              {point.left !== null && (
                <i
                  className="is-left"
                  style={{
                    height: `${Math.max(
                      8,
                      Math.abs(point.left) / maximum * 100,
                    )}%`,
                  }}
                  title={`SX ${formattedValue(point.left)} ${group.unit}`}
                />
              )}

              {point.right !== null && (
                <i
                  className="is-right"
                  style={{
                    height: `${Math.max(
                      8,
                      Math.abs(point.right) / maximum * 100,
                    )}%`,
                  }}
                  title={`DX ${formattedValue(point.right)} ${group.unit}`}
                />
              )}

              {point.bilateral !== null && (
                <i
                  className="is-bilateral"
                  style={{
                    height: `${Math.max(
                      8,
                      Math.abs(point.bilateral) / maximum * 100,
                    )}%`,
                  }}
                  title={`Bilaterale ${formattedValue(point.bilateral)} ${group.unit}`}
                />
              )}
            </div>

            <small>{formatShortDate(point.date)}</small>
          </div>
        ))}
      </div>

      <div className="test-paired-legend">
        {group.left && <span><i className="is-left" /> SX</span>}
        {group.right && <span><i className="is-right" /> DX</span>}
        {group.bilateral && (
          <span><i className="is-bilateral" /> Bilaterale</span>
        )}
      </div>

      <div className="test-paired-meta">
        {asymmetry && (
          <span>
            Asimmetria ultima rilevazione:{' '}
            <b>
              {asymmetry.percent.toLocaleString('it-IT', {
                maximumFractionDigits: 1,
              })}%
            </b>
            {asymmetry.weakerSide !== 'Bilanciato'
              ? ` - lato piu debole: ${asymmetry.weakerSide}`
              : ' - valori bilanciati'}
          </span>
        )}

        {group.right?.normalized !== null &&
          group.right?.normalized !== undefined && (
            <span>
              DX {group.right.normalized.toLocaleString(
                'it-IT',
                { maximumFractionDigits: 2 },
              )} x BW
            </span>
          )}

        {group.left?.normalized !== null &&
          group.left?.normalized !== undefined && (
            <span>
              SX {group.left.normalized.toLocaleString(
                'it-IT',
                { maximumFractionDigits: 2 },
              )} x BW
            </span>
          )}
      </div>
    </Panel>
  )
}

export function TestScreen({
  profile,
  selectedAthleteId,
}: {
  profile: AppProfile
  selectedAthleteId: string
}) {
  const manageable = canManageTests(profile.role)
  const initialAthleteId =
    profile.role === 'athlete'
      ? profile.athleteId ?? ''
      : selectedAthleteId

  const [data, setData] = useState<TestData | null>(null)
  const [athleteId, setAthleteId] =
    useState(initialAthleteId)
  const [formOpen, setFormOpen] = useState(false)
  const [retestSessionId, setRetestSessionId] =
    useState<string | null>(null)
  const [input, setInput] = useState<TestInput>(
    () => createTestInput(initialAthleteId),
  )
  const [state, setState] = useState<
    'loading' | 'idle' | 'saving'
  >('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleteTarget, setDeleteTarget] =
    useState<TestSessionRecord | null>(null)

  const refresh = async () => {
    const next = await loadTests(profile)
    setData(next)
    return next
  }

  useEffect(() => {
    let active = true

    setState('loading')
    setError('')

    refresh()
      .then(next => {
        if (!active) return

        setAthleteId(current => {
          if (
            profile.role === 'athlete' &&
            profile.athleteId
          ) {
            return profile.athleteId
          }

          if (
            selectedAthleteId &&
            next.athletes.some(
              athlete =>
                athlete.id === selectedAthleteId,
            )
          ) {
            return selectedAthleteId
          }

          return current ||
            next.athletes[0]?.id ||
            ''
        })
      })
      .catch(reason => {
        if (!active) return

        setError(
          reason instanceof Error
            ? reason.message
            : 'Test non caricati.',
        )
      })
      .finally(() => {
        if (active) setState('idle')
      })

    return () => {
      active = false
    }
  }, [
    profile.userId,
    profile.role,
    profile.athleteId,
    selectedAthleteId,
  ])

  useEffect(() => {
    setInput(value => ({
      ...value,
      athleteId,
    }))

    setFormOpen(false)
    setRetestSessionId(null)
  }, [athleteId])

  const presentation =
    data && athleteId
      ? buildTestPresentation(data, athleteId)
      : null

  const athleteName =
    data?.athletes.find(
      athlete => athlete.id === athleteId,
    )?.name ?? 'Atleta'

  const updateMetric = (
    index: number,
    patch: Partial<TestMetricInput>,
  ) => {
    setInput(value => ({
      ...value,
      metrics: value.metrics.map(
        (metric, metricIndex) =>
          metricIndex === index
            ? { ...metric, ...patch }
            : metric,
      ),
    }))
  }

  const startNewTest = () => {
    if (!manageable) return

    setError('')
    setMessage('')
    setRetestSessionId(null)
    setInput(createTestInput(athleteId))
    setFormOpen(true)
  }

  const startRetest = (
    testSessionId: string,
  ) => {
    if (!manageable || !data) return

    const retest = buildRetestInput(
      data,
      testSessionId,
    )

    if (!retest) {
      setError(
        'Il test selezionato non contiene misure riutilizzabili.',
      )
      return
    }

    setError('')
    setMessage('')
    setRetestSessionId(testSessionId)
    setInput(retest)
    setFormOpen(true)

    window.setTimeout(() => {
      document
        .querySelector('.test-entry-panel')
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
    }, 0)
  }

  const closeForm = () => {
    setFormOpen(false)
    setRetestSessionId(null)
    setError('')
  }

  const submit = async (
    event: FormEvent,
  ) => {
    event.preventDefault()

    if (!manageable) {
      setError(
        'La registrazione manuale dei test e riservata al coach.',
      )
      return
    }

    const validationError = validateTest(input)

    if (validationError) {
      setError(validationError)
      return
    }

    setState('saving')
    setError('')
    setMessage('')

    try {
      await createTest(profile, input)
      await refresh()
      setInput(createTestInput(athleteId))
      setFormOpen(false)
      setRetestSessionId(null)
      setMessage(
        'Test registrato. Storico, confronto e grafici sono stati aggiornati.',
      )
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Test non registrato.',
      )
    } finally {
      setState('idle')
    }
  }

  const removeTest = async () => {
    if (!deleteTarget || !manageable) return

    setState('saving')
    setError('')
    setMessage('')

    try {
      await deleteTest(
        profile,
        deleteTarget.id,
      )
      await refresh()
      setDeleteTarget(null)
      setMessage(
        'Rilevazione eliminata. Gli altri test non sono stati modificati.',
      )
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Test non eliminato.',
      )
    } finally {
      setState('idle')
    }
  }

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="TEST / RETEST / ANALYTICS"
        title={
          presentation?.sessions.length
            ? profile.role === 'athlete'
              ? 'I tuoi test e progressi.'
              : `Progressi di ${athleteName}.`
            : 'Costruisci la prima baseline.'
        }
        text={
          profile.role === 'athlete'
            ? 'Consulta risultati, andamento e differenze destra/sinistra. Le rilevazioni restano in sola lettura.'
            : 'Registra test manuali, riusa lo stesso protocollo per il retest e confronta destra e sinistra nello stesso grafico.'
        }
        action={
          <div className="header-actions">
            <Tag
              tone={
                data?.source === 'legacy-v1'
                  ? 'success'
                  : 'neutral'
              }
            >
              {data?.source === 'legacy-v1'
                ? 'DATI LIVE'
                : 'DEMO'}
            </Tag>

            {manageable && (
              <button
                className="button button--signal"
                disabled={!athleteId}
                onClick={() =>
                  formOpen
                    ? closeForm()
                    : startNewTest()
                }
              >
                <Plus size={16} />
                {formOpen
                  ? 'Chiudi'
                  : 'Registra test'}
              </button>
            )}
          </div>
        }
      />

      <div className="test-toolbar">
        <label>
          <span>Atleta</span>
          <select
            value={athleteId}
            onChange={event =>
              setAthleteId(event.target.value)
            }
            disabled={profile.role === 'athlete'}
          >
            {data?.athletes.map(athlete => (
              <option
                value={athlete.id}
                key={athlete.id}
              >
                {athlete.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <small>TEST REGISTRATI</small>
          <strong>
            {String(
              presentation?.sessions.length ?? 0,
            ).padStart(2, '0')}
          </strong>
        </div>

        <div>
          <small>SERIE MISURATE</small>
          <strong>
            {String(
              presentation?.groups.length ?? 0,
            ).padStart(2, '0')}
          </strong>
        </div>

        <div>
          <small>ULTIMO TEST</small>
          <strong className="test-toolbar__date">
            {presentation?.latestTestedAt
              ? formatShortDate(
                  presentation.latestTestedAt,
                )
              : '-'}
          </strong>
        </div>
      </div>

      <RemoteTestPanel
        profile={profile}
        athleteId={athleteId}
        onHistoryChanged={() => {
          void refresh()
        }}
      />

      {profile.role === 'athlete' && (
        <div className="test-readonly-banner">
          <ShieldCheck size={18} />
          <div>
            <b>Vista atleta in sola lettura</b>
            <span>
              Lo storico resta in sola lettura.
              Le batterie a distanza assegnate dal coach
              possono essere compilate direttamente qui.
            </span>
          </div>
        </div>
      )}

      {manageable && formOpen && (
        <Panel
          className="test-entry-panel"
          title={
            retestSessionId
              ? 'Retest con protocollo esistente'
              : 'Nuova rilevazione manuale'
          }
          index="00"
          action={
            <Tag tone="signal">
              {retestSessionId
                ? 'RETEST'
                : 'MANUALE'}
            </Tag>
          }
        >
          <form onSubmit={submit}>
            <div className="test-meta-form">
              <label>
                <span>Data</span>
                <input
                  type="date"
                  value={input.testedAt}
                  onChange={event =>
                    setInput(value => ({
                      ...value,
                      testedAt: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                <span>Peso corporeo</span>
                <div className="input-shell">
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={input.bodyWeightKg ?? ''}
                    onChange={event =>
                      setInput(value => ({
                        ...value,
                        bodyWeightKg:
                          event.target.value
                            ? Number(
                                event.target.value,
                              )
                            : null,
                      }))
                    }
                  />
                  <em>kg</em>
                </div>
              </label>

              <label>
                <span>Protocollo</span>
                <input
                  value={input.protocolVersion}
                  onChange={event =>
                    setInput(value => ({
                      ...value,
                      protocolVersion:
                        event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                <span>Setup generale</span>
                <input
                  value={String(
                    input.context.posture ?? '',
                  )}
                  onChange={event =>
                    setInput(value => ({
                      ...value,
                      context: {
                        ...value.context,
                        posture:
                          event.target.value,
                      },
                    }))
                  }
                  placeholder="Es. seated"
                />
              </label>
            </div>

            <div className="test-metric-editor">
              <div className="test-metric-head">
                <b>Misure</b>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setInput(value => ({
                      ...value,
                      metrics: [
                        ...value.metrics,
                        createMetricInput(),
                      ],
                    }))
                  }
                >
                  <Plus size={14} />
                  Aggiungi misura
                </button>
              </div>

              {input.metrics.map(
                (metric, index) => (
                  <div
                    className="test-metric-row"
                    key={`${index}-${metric.side}`}
                  >
                    <label>
                      <span>Metrica</span>
                      <input
                        value={metric.metricLabel}
                        onChange={event => {
                          const metricLabel =
                            event.target.value

                          updateMetric(index, {
                            metricLabel,
                            metricKey:
                              metricLabel
                                .toLocaleLowerCase('it')
                                .trim()
                                .replace(
                                  /[^a-z0-9]+/g,
                                  '_',
                                ),
                          })
                        }}
                      />
                    </label>

                    <label>
                      <span>Lato</span>
                      <select
                        value={metric.side ?? ''}
                        onChange={event =>
                          updateMetric(index, {
                            side:
                              (event.target.value ||
                                null) as TestMetricInput['side'],
                          })
                        }
                      >
                        <option value="bilateral">
                          Bilaterale
                        </option>
                        <option value="right">
                          Destra
                        </option>
                        <option value="left">
                          Sinistra
                        </option>
                        <option value="">
                          Nessuno
                        </option>
                      </select>
                    </label>

                    <label>
                      <span>Valore</span>
                      <input
                        type="number"
                        step="0.01"
                        value={
                          Number.isFinite(
                            metric.value,
                          )
                            ? metric.value
                            : ''
                        }
                        onChange={event =>
                          updateMetric(index, {
                            value:
                              event.target.value === ''
                                ? Number.NaN
                                : Number(
                                    event.target.value,
                                  ),
                          })
                        }
                        required
                      />
                    </label>

                    <label>
                      <span>Unita</span>
                      <input
                        value={metric.unit}
                        onChange={event =>
                          updateMetric(index, {
                            unit: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      <span>Presa</span>
                      <input
                        value={metric.grip}
                        onChange={event =>
                          updateMetric(index, {
                            grip: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="test-normalize">
                      <input
                        type="checkbox"
                        checked={
                          metric.normalizeToBodyWeight
                        }
                        onChange={event =>
                          updateMetric(index, {
                            normalizeToBodyWeight:
                              event.target.checked,
                          })
                        }
                      />
                      <span>Normalizza BW</span>
                    </label>

                    {input.metrics.length > 1 && (
                      <button
                        type="button"
                        className="text-button test-remove"
                        onClick={() =>
                          setInput(value => ({
                            ...value,
                            metrics:
                              value.metrics.filter(
                                (
                                  _,
                                  metricIndex,
                                ) =>
                                  metricIndex !==
                                  index,
                              ),
                          }))
                        }
                      >
                        Rimuovi
                      </button>
                    )}
                  </div>
                ),
              )}
            </div>

            <label className="test-notes">
              <span>Note</span>
              <textarea
                value={input.notes}
                onChange={event =>
                  setInput(value => ({
                    ...value,
                    notes: event.target.value,
                  }))
                }
                placeholder="Condizioni, dolore, osservazioni..."
              />
            </label>

            {error && (
              <p
                className="form-error form-error--box"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              className="button button--primary"
              disabled={state === 'saving'}
            >
              <Save size={16} />
              {state === 'saving'
                ? 'Registro...'
                : retestSessionId
                  ? 'Registra retest'
                  : 'Registra e calcola'}
            </button>
          </form>
        </Panel>
      )}

      {state === 'loading' && (
        <div className="skeleton-stack">
          <span />
          <span />
          <span />
        </div>
      )}

      {!formOpen && error && (
        <div className="completion-banner completion-banner--error">
          <TriangleAlert size={19} />
          <div>
            <b>Operazione non completata</b>
            <span>{error}</span>
          </div>
        </div>
      )}

      {message && (
        <div className="completion-banner">
          <ShieldCheck size={19} />
          <div>
            <b>Analytics aggiornate</b>
            <span>{message}</span>
          </div>
        </div>
      )}

      {presentation &&
        presentation.sessions.length === 0 &&
        state !== 'loading' && (
          <Panel title="Nessun test" index="01">
            <div className="empty-state">
              <TestTube2 size={22} />
              <b>Nessuna baseline disponibile</b>
              <span>
                {manageable
                  ? 'Registra il primo test per creare il riferimento.'
                  : 'I risultati compariranno qui dopo la prima valutazione registrata dal coach.'}
              </span>
            </div>
          </Panel>
        )}

      {!!presentation?.groups.length && (
        <div className="test-paired-grid">
          {presentation.groups.map(group => {
            const asymmetry =
              presentation.asymmetries.find(
                item =>
                  item.label === group.label &&
                  item.grip === group.grip,
              )

            return (
              <MetricGroupCard
                group={group}
                asymmetry={asymmetry}
                key={group.key}
              />
            )
          })}
        </div>
      )}

      {!!presentation?.sessions.length && data && (
        <Panel
          title="Storico test"
          index="H"
          action={
            <Tag tone="purple">
              {presentation.comparableSeries}{' '}
              serie confrontabili
            </Tag>
          }
        >
          <div
            className={`test-history test-history-v2 ${
              manageable
                ? ''
                : 'test-history-v2--readonly'
            }`}
          >
            <div>
              <b>Data</b>
              <b>Protocollo</b>
              <b>Origine</b>
              <b>Peso</b>
              <b>Misure</b>
              <b>Note</b>
              {manageable && <b>Azioni</b>}
            </div>

            {presentation.sessions.map(session => (
              <div key={session.id}>
                <span>
                  {formatTestDate(session.testedAt)}
                </span>
                <span>
                  {session.protocolVersion ||
                    'Non indicato'}
                </span>
                <span>
                  {testCaptureSourceLabel(session)}
                </span>
                <span>
                  {session.bodyWeightKg
                    ? `${session.bodyWeightKg.toLocaleString(
                        'it-IT',
                      )} kg`
                    : '-'}
                </span>
                <span>
                  {sessionMeasureCount(
                    data,
                    session.id,
                  )}
                </span>
                <span>{session.notes || '-'}</span>

                {manageable && (
                  <div className="test-history-actions">
                    <button
                      className="text-button"
                      disabled={state === 'saving'}
                      onClick={() =>
                        startRetest(session.id)
                      }
                    >
                      Retest
                      <ArrowRight size={13} />
                    </button>

                    <button
                      className="test-delete-button"
                      disabled={state === 'saving'}
                      onClick={() =>
                        setDeleteTarget(session)
                      }
                    >
                      <Trash2 size={14} />
                      Elimina
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {manageable && deleteTarget && data && (
        <ConfirmDialog
          title={`Eliminare il test del ${new Intl.DateTimeFormat(
            'it-IT',
            { dateStyle: 'long' },
          ).format(
            new Date(
              `${deleteTarget.testedAt}T12:00:00`,
            ),
          )}?`}
          text={`Verranno eliminati definitivamente la rilevazione e le sue ${sessionMeasureCount(
            data,
            deleteTarget.id,
          )} misure. Gli altri test, gli atleti e gli allenamenti non saranno modificati.`}
          confirmLabel="Elimina test"
          busy={state === 'saving'}
          onCancel={() =>
            setDeleteTarget(null)
          }
          onConfirm={() =>
            void removeTest()
          }
        />
      )}
    </div>
  )
}
