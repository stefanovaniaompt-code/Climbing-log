import {
  useEffect,
  useState,
  type FormEvent,
} from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bluetooth,
  Plus,
  Send,
  Save,
  TrendingUp,
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
  deleteTindeqTestAttempt,
  loadTests,
} from './testRepository'
import { RemoteTestPanel } from './RemoteTestPanel'
import { LiveTindeqPanel } from './LiveTindeqPanel'
import { liveGripLabel } from './liveTestTemplates'
import { AthleteProgressScreen } from './AthleteProgressScreen'
import {
  buildRetestInput,
  buildTestPresentation,
  canManageTests,
  sessionMeasureCount,
  sessionTindeqTests,
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
          {[
            liveGripLabel(group.grip),
            group.setupLabel,
            group.protocolVersion
              ? `v${group.protocolVersion}`
              : '',
          ]
            .filter(Boolean)
            .join(' · ') ||
            'Setup standard'}
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
              ? ` - lato più debole: ${asymmetry.weakerSide}`
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

function TestOverviewMetricCard({
  group,
}: {
  group: MetricSideBundle
}) {
  const readings = [
    { label: 'BILATERALE', value: group.bilateral },
    { label: 'DX', value: group.right },
    { label: 'SX', value: group.left },
  ].filter(
    (reading): reading is {
      label: string
      value: NonNullable<typeof reading.value>
    } => reading.value !== null,
  )
  const latestPoint = group.points[group.points.length - 1]

  return (
    <article className="test-overview-card">
      <TestTube2 size={25} aria-hidden="true" />
      <div className="test-overview-card__content">
        <p>{group.label}</p>
        <div className="test-overview-card__readings">
          {readings.map(reading => (
            <div key={reading.label}>
              <small>{reading.label}</small>
              <strong>
                {formattedValue(reading.value.latest)}
                <span> {group.unit}</span>
              </strong>
              {comparisonDelta(reading.value) && (
                <em>{comparisonDelta(reading.value)}</em>
              )}
            </div>
          ))}
        </div>
        <span className="test-overview-card__date">
          {latestPoint ? formatShortDate(latestPoint.date) : 'Data non disponibile'}
        </span>
      </div>
    </article>
  )
}

export function TestScreen({
  profile,
  selectedAthleteId,
  screen = 'tests',
  onOpenProgress,
  onOpenTests,
}: {
  profile: AppProfile
  selectedAthleteId: string
  screen?: 'tests' | 'progress'
  onOpenProgress?: () => void
  onOpenTests?: () => void
}) {
  const manageable = canManageTests(profile.role)
  const isProgress = screen === 'progress'
  const initialAthleteId =
    profile.role === 'athlete'
      ? profile.athleteId ?? ''
      : selectedAthleteId

  const [data, setData] = useState<TestData | null>(null)
  const [athleteId, setAthleteId] =
    useState(initialAthleteId)
  const [formOpen, setFormOpen] = useState(false)
  const [activeTestMode, setActiveTestMode] = useState<'live' | 'remote' | null>(null)
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
  const [managedSessionId, setManagedSessionId] =
    useState<string | null>(null)
  const [deleteTindeqTarget, setDeleteTindeqTarget] =
    useState<{
      attemptId: string
      label: string
      detail: string
      testedAt: string
    } | null>(null)

  useEffect(() => {
    if (isProgress) setActiveTestMode(null)
  }, [isProgress])

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

  const managedSession =
    presentation?.sessions.find(
      session => session.id === managedSessionId,
    ) ?? null

  const managedTindeqTests =
    data && managedSession
      ? sessionTindeqTests(data, managedSession.id)
      : []

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

  const removeTindeqTest = async () => {
    if (!deleteTindeqTarget || !manageable) return

    setState('saving')
    setError('')
    setMessage('')

    try {
      await deleteTindeqTestAttempt(
        profile,
        deleteTindeqTarget.attemptId,
      )
      await refresh()
      setDeleteTindeqTarget(null)
      setMessage(
        'Il singolo test Tindeq è stato eliminato. Gli altri test della sessione sono rimasti invariati.',
      )
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Test Tindeq non eliminato.',
      )
    } finally {
      setState('idle')
    }
  }

  if (profile.role === 'athlete') {
    return <AthleteProgressScreen
      athleteName={athleteName}
      presentation={presentation}
      loading={state === 'loading'}
      error={error}
      assignedTests={<RemoteTestPanel profile={profile} athleteId={athleteId} onHistoryChanged={() => { void refresh() }} />}
    />
  }

  return (
    <div className={`screen test-screen test-screen--${screen}${activeTestMode ? ' test-screen--mode' : ''}`}>
      <ScreenHeader
        eyebrow={isProgress
          ? '// PROGRESSI ATLETI'
          : activeTestMode === 'live'
            ? '04 / ACQUISIZIONE LIVE'
            : activeTestMode === 'remote'
              ? '04 / BATTERIE DA REMOTO'
              : '01 / TEST & RETEST'}
        title={isProgress ? 'PROGRESSI' : activeTestMode === 'live' ? 'LIVE' : activeTestMode === 'remote' ? 'A DISTANZA' : 'TEST'}
        text={isProgress
          ? `Andamento dei test, confronti e storico di ${athleteName}.`
          : activeTestMode === 'live'
            ? 'Avvia una sessione in tempo reale e registra le misurazioni con Tindeq Progressor.'
            : activeTestMode === 'remote'
              ? 'Crea e gestisci le batterie di test da assegnare all’atleta.'
              : 'Acquisizione, confronto e storico dei test strumentali dell’atleta.'}
        action={
          <div className="header-actions">
            {!isProgress && activeTestMode && (
              <button className="button button--secondary" onClick={() => setActiveTestMode(null)}>
                <ArrowLeft size={16} /> Torna a Test
              </button>
            )}

            {isProgress && onOpenTests && (
              <button className="button button--secondary" onClick={retestSessionId ? closeForm : onOpenTests}>
                {retestSessionId ? 'Chiudi retest' : 'Test / retest'}
              </button>
            )}

            {!isProgress && !activeTestMode && manageable && (
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
                {formOpen ? 'Chiudi' : 'Registra test'}
              </button>
            )}
          </div>
        }
      />

      {isProgress && (
        <div className="test-toolbar">
          <label>
            <span>Atleta</span>
            <select
              value={athleteId}
              onChange={event => setAthleteId(event.target.value)}
              disabled={false}
            >
              {data?.athletes.map(athlete => (
                <option value={athlete.id} key={athlete.id}>
                  {athlete.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {isProgress && (
        <section className="test-progress-athlete" aria-label={`Atleta ${athleteName}`}>
          <div className="test-progress-athlete__identity">
            <span aria-hidden="true">{athleteName.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toLocaleUpperCase('it-IT')}</span>
            <div>
              <small>ATLETA</small>
              <h2>{athleteName}</h2>
            </div>
          </div>
          <div className="test-progress-athlete__metric">
            <small>ULTIMA VALUTAZIONE</small>
            <strong>{presentation?.latestTestedAt ? formatShortDate(presentation.latestTestedAt) : 'Nessun test'}</strong>
          </div>
          <div className="test-progress-athlete__metric">
            <small>TEST REGISTRATI</small>
            <strong>{String(presentation?.sessions.length ?? 0).padStart(2, '0')}</strong>
          </div>
          <div className="test-progress-athlete__metric">
            <small>METRICHE CONFRONTABILI</small>
            <strong>{String(presentation?.groups.length ?? 0).padStart(2, '0')}</strong>
          </div>
        </section>
      )}

      {!isProgress && activeTestMode && (
        <section className="test-mode-context" aria-label={`Atleta selezionato: ${athleteName}`}>
          <div className="test-mode-context__identity">
            <span aria-hidden="true">
              {athleteName.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toLocaleUpperCase('it-IT')}
            </span>
            <div>
              <small>ATLETA SELEZIONATO</small>
              <strong>{athleteName}</strong>
            </div>
          </div>
          <label>
            <span>Cambia atleta</span>
            <select value={athleteId} onChange={event => setAthleteId(event.target.value)}>
              {data?.athletes.map(athlete => (
                <option value={athlete.id} key={athlete.id}>{athlete.name}</option>
              ))}
            </select>
          </label>
        </section>
      )}

      {!isProgress && !activeTestMode && (
        <section className="test-athlete-card" aria-label={`Atleta ${athleteName}`}>
          <div className="test-section-marker">
            <span>02</span> / ATLETA
          </div>

          <div className="test-athlete-card__identity">
            <span aria-hidden="true">
              {athleteName.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toLocaleUpperCase('it-IT')}
            </span>
            <h2>{athleteName}</h2>
          </div>

          <div className="test-athlete-card__metrics">
            <div>
              <small>ULTIMO TEST</small>
              <strong>{presentation?.latestTestedAt ? formatShortDate(presentation.latestTestedAt) : 'Nessun test'}</strong>
            </div>
            <div>
              <small>PROTOCOLLI ESEGUITI</small>
              <strong>{String(presentation?.sessions.length ?? 0).padStart(2, '0')}</strong>
            </div>
            <div>
              <small>METRICHE DISPONIBILI</small>
              <strong>{String(presentation?.groups.length ?? 0).padStart(2, '0')}</strong>
            </div>
          </div>

          <label className="test-athlete-card__select">
            <span>Cambia atleta</span>
            <select
              value={athleteId}
              onChange={event => setAthleteId(event.target.value)}
            >
              {data?.athletes.map(athlete => (
                <option value={athlete.id} key={athlete.id}>
                  {athlete.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {!isProgress && !activeTestMode && (
        <section className="test-hub-overview" aria-label="Ultimi risultati">
          <div className="test-section-heading">
            <div className="test-section-marker">
              <span>03</span> / OVERVIEW TEST
            </div>
            <button
              className="text-button"
              onClick={onOpenProgress}
              disabled={!onOpenProgress}
            >
              <TrendingUp size={16} /> Storico test atleta <ArrowRight size={14} />
            </button>
          </div>

          {presentation?.groups.length ? (
            <div className="test-overview-grid">
              {presentation.groups.map(group => (
                <TestOverviewMetricCard group={group} key={group.key} />
              ))}
            </div>
          ) : state !== 'loading' ? (
            <div className="test-overview-empty">
              <TestTube2 size={22} aria-hidden="true" />
              <div>
                <strong>Nessun test registrato</strong>
                <span>I risultati compariranno qui dopo la prima valutazione.</span>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {!isProgress && manageable && (
        <>
          {!activeTestMode && (
            <section className="test-new-test" aria-label="Nuovo test">
              <div className="test-section-heading test-section-heading--new">
                <div className="test-section-marker">
                  <span>04</span> / NUOVO TEST
                </div>
                <p>Scegli la modalità di acquisizione o assegnazione.</p>
              </div>

              <div className="test-mode-grid">
                <article className="test-mode-card test-mode-card--live">
                  <div className="test-mode-card__ornament" aria-hidden="true"><span /><span /><span /></div>
                  <div className="test-mode-card__copy">
                    <small>01 / ACQUISIZIONE DIRETTA</small>
                    <Activity size={22} aria-hidden="true" />
                    <h3>Sessione live</h3>
                    <p>Misura la forza in tempo reale collegando Tindeq Progressor.</p>
                  </div>
                  <button className="test-mode-card__action" onClick={() => setActiveTestMode('live')}>
                    <Bluetooth size={17} aria-hidden="true" /> Avvia test live <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </article>

                <article className="test-mode-card test-mode-card--remote">
                  <div className="test-mode-card__ornament" aria-hidden="true"><span /><span /><span /></div>
                  <div className="test-mode-card__copy">
                    <small>02 / ASSEGNAZIONE</small>
                    <Send size={22} aria-hidden="true" />
                    <h3>Batterie da remoto</h3>
                    <p>Prepara una batteria di prove e condividila con l’atleta.</p>
                  </div>
                  <button className="test-mode-card__action" onClick={() => setActiveTestMode('remote')}>
                    <Send size={16} aria-hidden="true" /> Gestisci batterie <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </article>
              </div>
            </section>
          )}

          <section className="test-mode-detail-host" aria-label="Schermate di acquisizione test">
            <div className="test-mode-detail-host__pane" hidden={activeTestMode !== 'live'}>
              <LiveTindeqPanel
                profile={profile}
                athleteId={athleteId}
                onHistoryChanged={() => { void refresh() }}
              />
            </div>
            <div className="test-mode-detail-host__pane" hidden={activeTestMode !== 'remote'}>
              <RemoteTestPanel
                profile={profile}
                athleteId={athleteId}
                onHistoryChanged={() => { void refresh() }}
              />
            </div>
          </section>
        </>
      )}

      {manageable && formOpen && (!isProgress || retestSessionId !== null) && !activeTestMode && (
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

      {isProgress && presentation &&
        presentation.sessions.length === 0 &&
        state !== 'loading' && (
          <Panel title="Progressi non ancora disponibili" index="01">
            <div className="empty-state">
              <TestTube2 size={22} />
              <b>Non ci sono ancora misurazioni</b>
              <span>
                I risultati compariranno qui dopo la prima valutazione registrata per questo atleta.
              </span>
            </div>
          </Panel>
        )}

      {isProgress && !!presentation?.groups.length && (
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

      {isProgress && !!presentation?.sessions.length && data && (
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
                    {sessionTindeqTests(data, session.id).length > 0 && (
                      <button
                        className="text-button"
                        disabled={state === 'saving'}
                        onClick={() =>
                          setManagedSessionId(current =>
                            current === session.id
                              ? null
                              : session.id,
                          )
                        }
                      >
                        Singoli test
                      </button>
                    )}

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

          {managedSession && managedTindeqTests.length > 0 && (
            <section className="test-session-items-manager">
              <header>
                <div>
                  <small>SESSIONE TINDEQ</small>
                  <b>{formatTestDate(managedSession.testedAt)}</b>
                </div>
                <button
                  className="text-button"
                  onClick={() => setManagedSessionId(null)}
                >
                  Chiudi
                </button>
              </header>

              {managedTindeqTests.map(test => (
                <div key={test.attemptId}>
                  <span>
                    <b>{test.label}</b>
                    <small>{test.detail}</small>
                  </span>
                  <button
                    className="test-delete-button"
                    disabled={state === 'saving'}
                    onClick={() =>
                      setDeleteTindeqTarget({
                        ...test,
                        testedAt: managedSession.testedAt,
                      })
                    }
                  >
                    <Trash2 size={14} />
                    Elimina test
                  </button>
                </div>
              ))}
            </section>
          )}
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

      {manageable && deleteTindeqTarget && (
        <ConfirmDialog
          title={`Eliminare ${deleteTindeqTarget.label}?`}
          text={`Verranno eliminati definitivamente il risultato, i tentativi e la curva acquisita il ${formatTestDate(
            deleteTindeqTarget.testedAt,
          )}. Gli altri test della sessione non saranno modificati.`}
          confirmLabel="Elimina singolo test"
          busy={state === 'saving'}
          onCancel={() => setDeleteTindeqTarget(null)}
          onConfirm={() => void removeTindeqTest()}
        />
      )}
    </div>
  )
}
