import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Check,
  ClipboardCheck,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react'

import type {
  AppProfile,
} from '../onboarding/types'

import {
  Panel,
  Tag,
} from '../shared/ui'

import {
  TEST_CATALOG,
  getTestDefinition,
  type TestProtocolKey,
} from './testCatalog'

import {
  addRemoteTestItem,
  cancelRemoteTestAssignment,
  clearRemoteManualMetric,
  completeRemoteTestItem,
  createRemoteTestAssignment,
  finishRemoteTestSession,
  remoteTestProgress,
  removeRemoteTestItem,
  saveRemoteTestDraft,
  setRemoteManualMetric,
  setRemoteTestNotes,
  skipRemoteTestItem,
  startRemoteTestItem,
  startRemoteTestSession,
  type RemoteTestAssignmentState,
} from './remoteTestRunner'

import {
  cancelRemoteAssignmentRecord,
  completeRemoteAssignmentRecord,
  createRemoteAssignmentRecord,
  loadRemoteAssignments,
  saveRemoteAssignmentDraft,
  startRemoteAssignmentRecord,
} from './remoteTestRepository'

import type {
  TestSide,
} from './testAttemptTypes'

const remoteDefinitions =
  TEST_CATALOG.filter(
    definition =>
      definition.sources.includes(
        'manual',
      ) &&
      definition.metrics.length > 0,
  )

function statusLabel(
  status:
    RemoteTestAssignmentState['session']['status'],
) {
  switch (status) {
    case 'assigned':
      return 'DA INIZIARE'

    case 'in_progress':
      return 'BOZZA'

    case 'completed':
      return 'COMPLETATA'

    case 'cancelled':
      return 'ANNULLATA'
  }
}

function itemStatusLabel(
  status:
    RemoteTestAssignmentState['items'][number]['item']['status'],
) {
  switch (status) {
    case 'pending':
      return 'DA FARE'

    case 'in_progress':
      return 'IN BOZZA'

    case 'completed':
      return 'ESEGUITO'

    case 'skipped':
      return 'NON ESEGUITO'
  }
}

function sideLabel(
  side: TestSide,
) {
  if (side === 'right') {
    return 'DX'
  }

  if (side === 'left') {
    return 'SX'
  }

  if (side === 'bilateral') {
    return 'Bilaterale'
  }

  return ''
}

function replaceAssignment(
  assignments:
    RemoteTestAssignmentState[],

  next:
    RemoteTestAssignmentState,
) {
  return assignments.map(
    assignment =>
      assignment.session.id ===
      next.session.id
        ? next
        : assignment,
  )
}

function metricValue(
  assignment:
    RemoteTestAssignmentState,

  itemId: string,
  metricKey: string,
) {
  return (
    assignment.items
      .find(
        entry =>
          entry.item.id ===
          itemId,
      )
      ?.values.find(
        value =>
          value.metricKey ===
          metricKey,
      )
      ?.value ?? ''
  )
}

export function RemoteTestPanel({
  profile,
  athleteId,
  onHistoryChanged,
}: {
  profile: AppProfile
  athleteId: string
  onHistoryChanged?: () => void
}) {
  const targetAthleteId =
    profile.role === 'athlete'
      ? profile.athleteId ?? ''
      : athleteId

  const [
    assignments,
    setAssignments,
  ] = useState<
    RemoteTestAssignmentState[]
  >([])

  const [
    coachDraft,
    setCoachDraft,
  ] = useState<
    RemoteTestAssignmentState | null
  >(null)

  const [
    protocolKey,
    setProtocolKey,
  ] = useState<TestProtocolKey>(
    'pullup_max',
  )

  const [
    side,
    setSide,
  ] = useState<
    Exclude<TestSide, null>
  >('right')

  const [
    grip,
    setGrip,
  ] = useState('')

  const [
    busy,
    setBusy,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const [
    message,
    setMessage,
  ] = useState('')

  const selectedDefinition =
    useMemo(
      () =>
        getTestDefinition(
          protocolKey,
        ),
      [protocolKey],
    )

  const reload =
    async () => {
      if (!targetAthleteId) {
        setAssignments([])
        return
      }

      const next =
        await loadRemoteAssignments(
          profile,
          targetAthleteId,
        )

      setAssignments(
        next,
      )
    }

  useEffect(() => {
    let active = true

    setCoachDraft(null)
    setError('')
    setMessage('')

    if (!targetAthleteId) {
      setAssignments([])
      return () => {
        active = false
      }
    }

    loadRemoteAssignments(
      profile,
      targetAthleteId,
    )
      .then(next => {
        if (active) {
          setAssignments(
            next,
          )
        }
      })
      .catch(reason => {
        if (!active) return

        setError(
          reason instanceof Error
            ? reason.message
            : 'Batterie test non caricate.',
        )
      })

    return () => {
      active = false
    }
  }, [
    profile.userId,
    profile.role,
    targetAthleteId,
  ])

  const applyAssignment =
    (
      next:
        RemoteTestAssignmentState,
    ) => {
      setAssignments(
        current =>
          replaceAssignment(
            current,
            next,
          ),
      )
    }

  const createCoachDraft =
    () => {
      if (
        profile.role !==
          'coach' ||
        !targetAthleteId
      ) {
        return
      }

      setCoachDraft(
        createRemoteTestAssignment(
          profile,
          targetAthleteId,
          {
            sessionId:
              crypto.randomUUID(),

            context: {
              capture_source:
                'remote_manual',
            },
          },
        ),
      )

      setError('')
      setMessage('')
    }

  const addCoachItem =
    () => {
      if (
        !coachDraft ||
        !selectedDefinition
      ) {
        return
      }

      try {
        const next =
          addRemoteTestItem(
            profile,
            coachDraft,
            protocolKey,
            {
              itemId:
                crypto.randomUUID(),

              side:
                selectedDefinition
                  .sideApplicable
                  ? side
                  : null,

              grip:
                selectedDefinition
                  .gripApplicable
                  ? grip.trim()
                  : '',
            },
          )

        setCoachDraft(next)
        setGrip('')
        setError('')
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Test non aggiunto.',
        )
      }
    }

  const assignCoachDraft =
    async () => {
      if (
        !coachDraft ||
        !coachDraft.items.length
      ) {
        setError(
          'Aggiungi almeno un test alla batteria.',
        )
        return
      }

      setBusy(true)
      setError('')
      setMessage('')

      try {
        await createRemoteAssignmentRecord(
          profile,
          coachDraft,
        )

        setCoachDraft(null)

        await reload()

        setMessage(
          'Batteria a distanza assegnata.',
        )
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Batteria non assegnata.',
        )
      } finally {
        setBusy(false)
      }
    }

  const cancelAssignment =
    async (
      assignment:
        RemoteTestAssignmentState,
    ) => {
      if (
        !window.confirm(
          'Annullare questa batteria a distanza?',
        )
      ) {
        return
      }

      setBusy(true)
      setError('')

      try {
        const next =
          cancelRemoteTestAssignment(
            profile,
            assignment,
          )

        await cancelRemoteAssignmentRecord(
          profile,
          next,
        )

        applyAssignment(
          next,
        )

        setMessage(
          'Batteria annullata.',
        )
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Batteria non annullata.',
        )
      } finally {
        setBusy(false)
      }
    }

  const startAthleteAssignment =
    async (
      assignment:
        RemoteTestAssignmentState,
    ) => {
      setBusy(true)
      setError('')
      setMessage('')

      try {
        const next =
          startRemoteTestSession(
            profile,
            assignment,
          )

        await startRemoteAssignmentRecord(
          profile,
          next,
        )

        applyAssignment(
          next,
        )

        setMessage(
          'Batteria iniziata. Puoi salvarla e riprenderla anche in un altro momento.',
        )
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Batteria non avviata.',
        )
      } finally {
        setBusy(false)
      }
    }

  const updateMetric =
    (
      assignment:
        RemoteTestAssignmentState,

      itemId: string,
      metricKey: string,
      rawValue: string,
    ) => {
      try {
        const next =
          rawValue === ''
            ? clearRemoteManualMetric(
                profile,
                assignment,
                itemId,
                metricKey,
              )
            : setRemoteManualMetric(
                profile,
                assignment,
                itemId,
                metricKey,
                Number(
                  rawValue,
                ),
              )

        applyAssignment(
          next,
        )
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Valore non valido.',
        )
      }
    }

  const updateNotes =
    (
      assignment:
        RemoteTestAssignmentState,

      itemId: string,
      notes: string,
    ) => {
      try {
        applyAssignment(
          setRemoteTestNotes(
            profile,
            assignment,
            itemId,
            notes,
          ),
        )
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Nota non aggiornata.',
        )
      }
    }

  const completeItem =
    async (
      assignment:
        RemoteTestAssignmentState,

      itemId: string,
    ) => {
      setBusy(true)
      setError('')

      try {
        let working =
          assignment

        if (
          working.activeItemId &&
          working.activeItemId !==
            itemId
        ) {
          working =
            saveRemoteTestDraft(
              profile,
              working,
            )
        }

        working =
          startRemoteTestItem(
            profile,
            working,
            itemId,
          )

        working =
          completeRemoteTestItem(
            profile,
            working,
            itemId,
          )

        await saveRemoteAssignmentDraft(
          profile,
          working,
        )

        applyAssignment(
          working,
        )

        setMessage(
          'Test segnato come eseguito e salvato.',
        )
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Test non completato.',
        )
      } finally {
        setBusy(false)
      }
    }

  const skipItem =
    async (
      assignment:
        RemoteTestAssignmentState,

      itemId: string,
    ) => {
      if (
        !window.confirm(
          'Confermi che questo test non verra eseguito?',
        )
      ) {
        return
      }

      setBusy(true)
      setError('')

      try {
        let working =
          assignment

        if (
          working.activeItemId &&
          working.activeItemId !==
            itemId
        ) {
          working =
            saveRemoteTestDraft(
              profile,
              working,
            )
        }

        working =
          skipRemoteTestItem(
            profile,
            working,
            itemId,
          )

        await saveRemoteAssignmentDraft(
          profile,
          working,
        )

        applyAssignment(
          working,
        )

        setMessage(
          'Test segnato come non eseguito.',
        )
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Test non aggiornato.',
        )
      } finally {
        setBusy(false)
      }
    }

  const saveDraft =
    async (
      assignment:
        RemoteTestAssignmentState,
    ) => {
      setBusy(true)
      setError('')
      setMessage('')

      try {
        const next =
          saveRemoteTestDraft(
            profile,
            assignment,
          )

        await saveRemoteAssignmentDraft(
          profile,
          next,
        )

        applyAssignment(
          next,
        )

        setMessage(
          'Bozza salvata. Potrai riprendere la batteria in seguito.',
        )
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Bozza non salvata.',
        )
      } finally {
        setBusy(false)
      }
    }

  const submitAssignment =
    async (
      assignment:
        RemoteTestAssignmentState,
    ) => {
      setBusy(true)
      setError('')
      setMessage('')

      try {
        const next =
          finishRemoteTestSession(
            profile,
            assignment,
          )

        await completeRemoteAssignmentRecord(
          profile,
          next,
        )

        applyAssignment(
          next,
        )

        setMessage(
          'Batteria completata e inviata.',
        )

        onHistoryChanged?.()
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Batteria non completata.',
        )
      } finally {
        setBusy(false)
      }
    }

  if (!targetAthleteId) {
    return null
  }

  const openAssignments =
    assignments.filter(
      assignment =>
        assignment.session.status !==
          'cancelled',
    )

  return (
    <section className="remote-tests">
      <div className="remote-tests__heading">
        <div>
          <small>
            TEST A DISTANZA
          </small>

          <h3>
            {profile.role ===
            'coach'
              ? 'Batterie da remoto'
              : 'I test assegnati'}
          </h3>
        </div>

        {profile.role ===
          'coach' &&
          !coachDraft && (
            <button
              className="button button--signal"
              disabled={busy}
              onClick={
                createCoachDraft
              }
            >
              <Plus size={16} />
              Nuova batteria
            </button>
          )}
      </div>

      {error && (
        <div className="remote-tests__notice remote-tests__notice--error">
          {error}
        </div>
      )}

      {message && (
        <div className="remote-tests__notice">
          {message}
        </div>
      )}

      {profile.role ===
        'coach' &&
        coachDraft && (
          <Panel
            className="remote-test-builder"
            title="Nuova batteria a distanza"
            index="R"
            action={
              <Tag tone="signal">
                MANUALE
              </Tag>
            }
          >
            <div className="remote-test-builder__controls">
              <label>
                <span>Test</span>

                <select
                  value={
                    protocolKey
                  }
                  onChange={
                    event => {
                      const next =
                        event
                          .target
                          .value as
                          TestProtocolKey

                      setProtocolKey(
                        next,
                      )

                      const definition =
                        getTestDefinition(
                          next,
                        )

                      if (
                        !definition
                          ?.sideApplicable
                      ) {
                        setSide(
                          'right',
                        )
                      }

                      setGrip('')
                    }
                  }
                >
                  {remoteDefinitions.map(
                    definition => (
                      <option
                        key={
                          definition.key
                        }
                        value={
                          definition.key
                        }
                      >
                        {
                          definition.name
                        }
                      </option>
                    ),
                  )}
                </select>
              </label>

              {selectedDefinition
                ?.sideApplicable && (
                <label>
                  <span>Lato</span>

                  <select
                    value={side}
                    onChange={
                      event =>
                        setSide(
                          event
                            .target
                            .value as
                            Exclude<
                              TestSide,
                              null
                            >,
                        )
                    }
                  >
                    <option value="right">
                      DX
                    </option>

                    <option value="left">
                      SX
                    </option>

                    <option value="bilateral">
                      Bilaterale
                    </option>
                  </select>
                </label>
              )}

              {selectedDefinition
                ?.gripApplicable && (
                <label>
                  <span>
                    Presa / setup
                  </span>

                  <input
                    value={grip}
                    placeholder="es. barra"
                    onChange={
                      event =>
                        setGrip(
                          event
                            .target
                            .value,
                        )
                    }
                  />
                </label>
              )}

              <button
                className="button"
                type="button"
                onClick={addCoachItem}
              >
                <Plus size={15} />
                Aggiungi
              </button>
            </div>

            <div className="remote-test-builder__items">
              {coachDraft.items.length ===
              0 ? (
                <p>
                  Aggiungi i test che
                  l'atleta dovra
                  eseguire in autonomia.
                </p>
              ) : (
                coachDraft.items.map(
                  entry => {
                    const definition =
                      getTestDefinition(
                        entry.item
                          .protocolKey,
                      )

                    return (
                      <div
                        className="remote-test-builder__item"
                        key={
                          entry.item.id
                        }
                      >
                        <div>
                          <b>
                            {
                              definition
                                ?.name
                            }
                          </b>

                          <span>
                            {sideLabel(
                              entry.item
                                .side,
                            )}

                            {entry.item
                              .grip
                              ? ` - ${entry.item.grip}`
                              : ''}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="remote-tests__icon-button"
                          aria-label="Rimuovi test"
                          onClick={() =>
                            setCoachDraft(
                              current =>
                                current
                                  ? removeRemoteTestItem(
                                      profile,
                                      current,
                                      entry
                                        .item
                                        .id,
                                    )
                                  : current,
                            )
                          }
                        >
                          <Trash2
                            size={16}
                          />
                        </button>
                      </div>
                    )
                  },
                )
              )}
            </div>

            <div className="remote-tests__actions">
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() =>
                  setCoachDraft(
                    null,
                  )
                }
              >
                <X size={15} />
                Annulla
              </button>

              <button
                className="button button--signal"
                type="button"
                disabled={
                  busy ||
                  !coachDraft
                    .items.length
                }
                onClick={
                  assignCoachDraft
                }
              >
                <Send size={15} />
                Assegna batteria
              </button>
            </div>
          </Panel>
        )}

      {openAssignments.length ===
      0 &&
      !coachDraft ? (
        <div className="remote-tests__empty">
          <ClipboardCheck
            size={22}
          />

          <span>
            {profile.role ===
            'coach'
              ? 'Nessuna batteria a distanza assegnata a questo atleta.'
              : 'Non hai batterie di test a distanza da compilare.'}
          </span>
        </div>
      ) : (
        openAssignments.map(
          assignment => {
            const progress =
              remoteTestProgress(
                assignment,
              )

            const allClosed =
              progress.total > 0 &&
              progress.closed ===
                progress.total

            return (
              <Panel
                className="remote-assignment"
                key={
                  assignment.session
                    .id
                }
                title={`Batteria ${assignment.session.testedAt}`}
                index="R"
                action={
                  <Tag
                    tone={
                      assignment
                        .session
                        .status ===
                      'completed'
                        ? 'success'
                        : 'purple'
                    }
                  >
                    {statusLabel(
                      assignment
                        .session
                        .status,
                    )}
                  </Tag>
                }
              >
                <div className="remote-assignment__progress">
                  <span>
                    {
                      progress.completed
                    } eseguiti
                  </span>

                  <span>
                    {
                      progress.skipped
                    } non eseguiti
                  </span>

                  <strong>
                    {Math.round(
                      progress.percent,
                    )}
                    %
                  </strong>
                </div>

                {profile.role ===
                  'coach' && (
                  <>
                    <div className="remote-assignment__coach-list">
                      {assignment.items.map(
                        entry => {
                          const definition =
                            getTestDefinition(
                              entry.item
                                .protocolKey,
                            )

                          return (
                            <div
                              key={
                                entry.item
                                  .id
                              }
                            >
                              <div>
                                <b>
                                  {
                                    definition
                                      ?.name
                                  }
                                </b>

                                <span>
                                  {sideLabel(
                                    entry.item
                                      .side,
                                  )}

                                  {entry.item
                                    .grip
                                    ? ` - ${entry.item.grip}`
                                    : ''}
                                </span>
                              </div>

                              <Tag
                                tone={
                                  entry.item
                                    .status ===
                                  'completed'
                                    ? 'success'
                                    : 'neutral'
                                }
                              >
                                {itemStatusLabel(
                                  entry.item
                                    .status,
                                )}
                              </Tag>
                            </div>
                          )
                        },
                      )}
                    </div>

                    {assignment
                      .session
                      .status !==
                      'completed' && (
                      <div className="remote-tests__actions">
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void cancelAssignment(
                              assignment,
                            )
                          }
                        >
                          <X
                            size={15}
                          />
                          Annulla batteria
                        </button>
                      </div>
                    )}
                  </>
                )}

                {profile.role ===
                  'athlete' &&
                  assignment
                    .session
                    .status ===
                    'assigned' && (
                    <div className="remote-tests__actions">
                      <button
                        className="button button--signal"
                        disabled={busy}
                        onClick={() =>
                          void startAthleteAssignment(
                            assignment,
                          )
                        }
                      >
                        <ClipboardCheck
                          size={16}
                        />
                        Inizia batteria
                      </button>
                    </div>
                  )}

                {profile.role ===
                  'athlete' &&
                  assignment
                    .session
                    .status ===
                    'in_progress' && (
                    <>
                      <div className="remote-assignment__items">
                        {assignment.items.map(
                          entry => {
                            const definition =
                              getTestDefinition(
                                entry.item
                                  .protocolKey,
                              )

                            const closed =
                              entry.item
                                .status ===
                                'completed' ||
                              entry.item
                                .status ===
                                'skipped'

                            return (
                              <article
                                className="remote-assignment__item"
                                key={
                                  entry.item
                                    .id
                                }
                              >
                                <header>
                                  <div>
                                    <small>
                                      TEST{' '}
                                      {
                                        entry
                                          .item
                                          .itemOrder
                                      }
                                    </small>

                                    <h4>
                                      {
                                        definition
                                          ?.name
                                      }
                                    </h4>

                                    <span>
                                      {sideLabel(
                                        entry
                                          .item
                                          .side,
                                      )}

                                      {entry
                                        .item
                                        .grip
                                        ? ` - ${entry.item.grip}`
                                        : ''}
                                    </span>
                                  </div>

                                  <Tag
                                    tone={
                                      entry.item
                                        .status ===
                                      'completed'
                                        ? 'success'
                                        : 'neutral'
                                    }
                                  >
                                    {itemStatusLabel(
                                      entry.item
                                        .status,
                                    )}
                                  </Tag>
                                </header>

                                {!closed && (
                                  <div className="remote-assignment__metric-grid">
                                    {definition?.metrics.map(
                                      metric => (
                                        <label
                                          key={
                                            metric.key
                                          }
                                        >
                                          <span>
                                            {
                                              metric.label
                                            }
                                          </span>

                                          <div className="remote-assignment__metric-input">
                                            <input
                                              type="number"
                                              step="any"
                                              value={metricValue(
                                                assignment,
                                                entry
                                                  .item
                                                  .id,
                                                metric.key,
                                              )}
                                              onChange={
                                                event =>
                                                  updateMetric(
                                                    assignment,
                                                    entry
                                                      .item
                                                      .id,
                                                    metric.key,
                                                    event
                                                      .target
                                                      .value,
                                                  )
                                              }
                                            />

                                            <b>
                                              {
                                                metric.unit
                                              }
                                            </b>
                                          </div>
                                        </label>
                                      ),
                                    )}
                                  </div>
                                )}

                                {!closed && (
                                  <label className="remote-assignment__notes">
                                    <span>
                                      Note
                                      facoltative
                                    </span>

                                    <textarea
                                      value={
                                        entry.notes
                                      }
                                      onChange={
                                        event =>
                                          updateNotes(
                                            assignment,
                                            entry
                                              .item
                                              .id,
                                            event
                                              .target
                                              .value,
                                          )
                                      }
                                      placeholder="Eventuali note sull'esecuzione"
                                    />
                                  </label>
                                )}

                                {!closed && (
                                  <div className="remote-tests__actions">
                                    <button
                                      className="button button--signal"
                                      type="button"
                                      disabled={
                                        busy ||
                                        !entry
                                          .values
                                          .length
                                      }
                                      onClick={() =>
                                        void completeItem(
                                          assignment,
                                          entry
                                            .item
                                            .id,
                                        )
                                      }
                                    >
                                      <Check
                                        size={15}
                                      />
                                      Test eseguito
                                    </button>

                                    <button
                                      className="button"
                                      type="button"
                                      disabled={
                                        busy
                                      }
                                      onClick={() =>
                                        void skipItem(
                                          assignment,
                                          entry
                                            .item
                                            .id,
                                        )
                                      }
                                    >
                                      Non eseguito
                                    </button>
                                  </div>
                                )}

                                {closed && (
                                  <div className="remote-assignment__closed">
                                    {entry.item
                                      .status ===
                                    'completed' ? (
                                      <>
                                        <Check
                                          size={16}
                                        />
                                        Test eseguito
                                        {entry.completedAt
                                          ? ` - ${new Date(
                                              entry.completedAt,
                                            ).toLocaleDateString(
                                              'it-IT',
                                            )}`
                                          : ''}
                                      </>
                                    ) : (
                                      <>
                                        <X
                                          size={16}
                                        />
                                        Test non eseguito
                                      </>
                                    )}
                                  </div>
                                )}
                              </article>
                            )
                          },
                        )}
                      </div>

                      <div className="remote-tests__actions remote-tests__actions--footer">
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void saveDraft(
                              assignment,
                            )
                          }
                        >
                          <Save
                            size={15}
                          />
                          Salva bozza
                        </button>

                        <button
                          className="button button--signal"
                          type="button"
                          disabled={
                            busy ||
                            !allClosed
                          }
                          onClick={() =>
                            void submitAssignment(
                              assignment,
                            )
                          }
                        >
                          <Send
                            size={15}
                          />
                          Termina e invia
                        </button>
                      </div>

                      {!allClosed && (
                        <small className="remote-assignment__hint">
                          Puoi salvare ora e
                          completare i test
                          mancanti anche in
                          un'altra giornata.
                        </small>
                      )}
                    </>
                  )}

                {profile.role ===
                  'athlete' &&
                  assignment
                    .session
                    .status ===
                    'completed' && (
                    <div className="remote-assignment__closed">
                      <Check
                        size={16}
                      />
                      Batteria completata
                      e inviata.
                    </div>
                  )}
              </Panel>
            )
          },
        )
      )}
    </section>
  )
}
