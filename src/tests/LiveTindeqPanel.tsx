import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  Bluetooth,
  Check,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Square,
  Unplug,
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
  getTestDefinition,
  TEST_CATALOG,
  type TestProtocolKey,
} from './testCatalog'

import {
  createProgressorLiveTestRuntime,
  type ProgressorLiveRuntimeHandle,
} from './liveTestRuntimeFactory'

import type {
  LiveTestRuntimeSnapshot,
} from './liveTestRuntime'

import {
  primaryCanonicalMetric,
} from './testCanonicalResults'

import {
  flushLiveTestSession,
  persistLiveAttemptRecord,
  persistLiveRunnerState,
  persistOfficialLiveAttempt,
} from './liveTestPersistence'

import { LiveForceChart } from './LiveForceChart'

import {
  loadLiveTestDraft,
  saveLiveTestDraft,
} from './liveTestDraftStorage'

type LiveSide =
  | 'left'
  | 'right'
  | 'bilateral'

const TARGET_PROTOCOLS =
  new Set<TestProtocolKey>([
    'finger_endurance_60mvc',
    'repeaters_7_3',
    'endurance',
    'repeaters',
  ])

const liveDefinitions =
  TEST_CATALOG.filter(
    definition =>
      definition.sources.includes(
        'tindeq',
      ) &&
      definition.metrics.length >
        0 &&
      /*
       * Critical Force is a multi-interval
       * protocol and needs its own guided
       * workflow rather than one acquisition.
       */
      definition.key !==
        'critical_force',
  )

function transportLabel(
  value:
    ProgressorLiveRuntimeHandle['transportKind'],
) {
  if (value === 'native') {
    return 'BLE NATIVO'
  }

  if (value === 'web') {
    return 'WEB BLUETOOTH'
  }

  return 'NON SUPPORTATO'
}

function connectionLabel(
  value: string,
) {
  if (value === 'connected') {
    return 'CONNESSO'
  }

  if (value === 'connecting') {
    return 'CONNESSIONE...'
  }

  if (value === 'error') {
    return 'ERRORE'
  }

  return 'DISCONNESSO'
}

function itemStatusLabel(
  value: string,
) {
  if (value === 'completed') {
    return 'COMPLETATO'
  }

  if (value === 'skipped') {
    return 'SALTATO'
  }

  if (value === 'in_progress') {
    return 'IN CORSO'
  }

  return 'DA FARE'
}

function qualityTone(
  quality:
    'VALID' |
    'REVIEW' |
    'INVALID',
) {
  if (quality === 'VALID') {
    return 'success' as const
  }

  if (quality === 'REVIEW') {
    return 'warning' as const
  }

  return 'neutral' as const
}

function formatForce(
  value: number | null,
) {
  if (value === null) {
    return '-'
  }

  return value
    .toLocaleString(
      'it-IT',
      {
        maximumFractionDigits:
          1,
      },
    )
}

export function LiveTindeqPanel({
  profile,
  athleteId,
  onHistoryChanged,
}: {
  profile: AppProfile
  athleteId: string
  onHistoryChanged?: () => void
}) {
  const handleRef =
    useRef<
      ProgressorLiveRuntimeHandle |
      null
    >(null)

  const unsubscribeRef =
    useRef<
      (() => void) |
      null
    >(null)

  const persistedAttemptsRef =
    useRef(
      new Set<string>(),
    )

  const [
    snapshot,
    setSnapshot,
  ] = useState<
    LiveTestRuntimeSnapshot |
    null
  >(null)

  const [
    transport,
    setTransport,
  ] = useState<
    ProgressorLiveRuntimeHandle['transportKind']
  >('unsupported')

  const [
    supported,
    setSupported,
  ] = useState(false)

  const [
    protocolKey,
    setProtocolKey,
  ] = useState<TestProtocolKey>(
    'peak_force',
  )

  const [
    side,
    setSide,
  ] = useState<LiveSide>(
    'right',
  )

  const [
    grip,
    setGrip,
  ] = useState(
    '20 mm',
  )

  const [
    bodyWeight,
    setBodyWeight,
  ] = useState('')

  const [
    maximumForceN,
    setMaximumForceN,
  ] = useState('')

  const [
    targetPercent,
    setTargetPercent,
  ] = useState('60')

  const [
    rfdWindowMs,
    setRfdWindowMs,
  ] = useState('200')

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

  const definition =
    getTestDefinition(
      protocolKey,
    )

  const runtime =
    handleRef.current
      ?.runtime ??
    null

  const activeItem =
    snapshot?.runner.items.find(
      entry =>
        entry.item.id ===
        snapshot.runner
          .activeItemId,
    ) ??
    null

  const activeDefinition =
    activeItem
      ? getTestDefinition(
          activeItem.item.protocolKey,
        )
      : null

  const activeTargetN =
    activeItem &&
    typeof activeItem.item.config.targetN === 'number' &&
    Number.isFinite(activeItem.item.config.targetN)
      ? activeItem.item.config.targetN
      : null

  const activeTargetTolerance =
    activeItem &&
    typeof activeItem.item.config.targetTolerancePercent === 'number'
      ? activeItem.item.config.targetTolerancePercent
      : 0.1

  const activeAverageForce =
    snapshot?.curve.length
      ? snapshot.curve.reduce(
          (sum, point) => sum + point.forceN,
          0,
        ) / snapshot.curve.length
      : null

  const closedCount =
    snapshot?.runner.items.filter(
      entry =>
        entry.item.status ===
          'completed' ||
        entry.item.status ===
          'skipped',
    ).length ??
    0

  const allClosed =
    Boolean(
      snapshot &&
      snapshot.runner.items.length >
        0 &&
      closedCount ===
        snapshot.runner.items.length,
    )

  const persistNewAttempts =
    (
      next:
        LiveTestRuntimeSnapshot,
    ) => {
      for (
        const entry
        of next.runner.items
      ) {
        for (
          const record
          of entry.attempts
        ) {
          const attemptId =
            record.attempt
              .attemptId

          if (
            persistedAttemptsRef
              .current
              .has(attemptId)
          ) {
            continue
          }

          persistedAttemptsRef
            .current
            .add(attemptId)

          void persistLiveAttemptRecord(
            profile,
            next.runner,
            entry.item.id,
            attemptId,
          ).catch(
            reason => {
              persistedAttemptsRef
                .current
                .delete(
                  attemptId,
                )

              setError(
                reason instanceof
                  Error
                  ? reason.message
                  : 'Tentativo Tindeq non salvato.',
              )
            },
          )
        }
      }
    }

  const attachRuntimeHandle = (
    handle: ProgressorLiveRuntimeHandle,
  ) => {
    handleRef.current = handle
    persistedAttemptsRef.current.clear()
    setTransport(handle.transportKind)
    setSupported(handle.supported)

    unsubscribeRef.current =
      handle.runtime.subscribe(next => {
        setSnapshot(next)
        saveLiveTestDraft(
          profile.userId,
          athleteId,
          next.runner,
        )
        persistNewAttempts(next)
      })
  }

  const cleanupRuntime =
    async () => {
      const current =
        handleRef.current

      if (!current) {
        unsubscribeRef.current?.()
        unsubscribeRef.current = null
        setSnapshot(null)
        return
      }

      try {
        if (
          current.runtime
            .isAcquiring
        ) {
          await current.runtime
            .interruptAcquisition(
              'app-background',
            )
        }

        saveLiveTestDraft(
          profile.userId,
          athleteId,
          current.runtime.snapshot.runner,
        )

        await flushLiveTestSession(
          profile,
          current.runtime
            .snapshot
            .runner,
        )
      } catch {
        /*
         * Cleanup must continue even
         * if network persistence fails.
         */
      }


      unsubscribeRef.current?.()
      unsubscribeRef.current = null

      try {
        if (
          current.runtime
            .snapshot
            .connectionState ===
          'connected'
        ) {
          await current.runtime
            .disconnect()
        }
      } catch {
        /* best effort */
      }

      try {
        current.dispose()
      } catch {
        /* best effort */
      }

      handleRef.current =
        null

      persistedAttemptsRef
        .current
        .clear()

      setSnapshot(null)
    }

  useEffect(
    () => {
      const restored = loadLiveTestDraft(
        profile.userId,
        athleteId,
      )

      if (restored) {
        try {
          attachRuntimeHandle(
            createProgressorLiveTestRuntime(
              profile,
              athleteId,
              { runner: restored },
            ),
          )
          setMessage(
            'Sessione Tindeq provvisoria ripristinata.',
          )
        } catch {
          setError(
            'La sessione Tindeq provvisoria non può essere ripristinata.',
          )
        }
      }

      return () => {
        void cleanupRuntime()
      }
    },
    [
      athleteId,
      profile.userId,
    ],
  )

  const createSession =
    async () => {
      if (
        profile.role !==
          'coach' ||
        !athleteId
      ) {
        return
      }

      setBusy(true)
      setError('')
      setMessage('')

      try {
        await cleanupRuntime()

        const parsedWeight =
          bodyWeight.trim()
            ? Number(
                bodyWeight,
              )
            : null

        if (
          parsedWeight !== null &&
          (
            !Number.isFinite(
              parsedWeight,
            ) ||
            parsedWeight <= 0
          )
        ) {
          throw new Error(
            'Il peso corporeo deve essere maggiore di zero.',
          )
        }

        const handle =
          createProgressorLiveTestRuntime(
            profile,
            athleteId,
            {
              bodyWeightKg:
                parsedWeight,
            },
          )

        attachRuntimeHandle(handle)

        await persistLiveRunnerState(
          profile,
          handle.runtime
            .snapshot
            .runner,
        )

        setMessage(
          'Sessione live creata. Collega il Tindeq.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Sessione Tindeq non creata.',
        )
      } finally {
        setBusy(false)
      }
    }

  const connect =
    async () => {
      if (!runtime) return

      setBusy(true)
      setError('')
      setMessage('')

      try {
        await runtime.connect()

        setMessage(
          'Tindeq connesso.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Connessione Tindeq non riuscita.',
        )
      } finally {
        setBusy(false)
      }
    }

  const reconnect =
    async () => {
      if (!runtime) return

      setBusy(true)
      setError('')

      try {
        await runtime.reconnect()

        setMessage(
          'Tindeq riconnesso.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Riconnessione non riuscita.',
        )
      } finally {
        setBusy(false)
      }
    }

  const disconnect =
    async () => {
      if (!runtime) return

      setBusy(true)
      setError('')

      try {
        await runtime.disconnect()

        setMessage(
          'Tindeq disconnesso.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Disconnessione non riuscita.',
        )
      } finally {
        setBusy(false)
      }
    }

  const tare =
    async () => {
      if (!runtime) return

      setBusy(true)
      setError('')

      try {
        await runtime.tare()

        setMessage(
          'Tara completata.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Tara non riuscita.',
        )
      } finally {
        setBusy(false)
      }
    }

  const addItem =
    async () => {
      if (
        !runtime ||
        !definition
      ) {
        return
      }

      setBusy(true)
      setError('')
      setMessage('')

      try {
        const config:
          Record<
            string,
            unknown
          > = {
            primaryMetricKey:
              definition
                .primaryMetricKey,
        }

        if (
          protocolKey ===
            'rfd'
        ) {
          const window =
            Number(
              rfdWindowMs,
            )

          if (
            !Number.isFinite(
              window,
            ) ||
            window <= 0
          ) {
            throw new Error(
              'La finestra RFD deve essere maggiore di zero.',
            )
          }

          config.rfdWindowMs =
            window
        }

        if (
          TARGET_PROTOCOLS.has(
            protocolKey,
          )
        ) {
          const maximum =
            Number(maximumForceN)

          const percentage =
            Number(targetPercent)

          if (
            !Number.isFinite(
              maximum,
            ) ||
            maximum <= 0
          ) {
            throw new Error(
              'Inserisci il massimale di forza in N.',
            )
          }

          if (
            !Number.isFinite(percentage) ||
            percentage <= 0 ||
            percentage > 100
          ) {
            throw new Error(
              'La percentuale target deve essere compresa tra 1 e 100.',
            )
          }

          config.maximumForceN = maximum
          config.targetPercent = percentage
          config.targetTolerancePercent = 0.1
          config.targetN =
            maximum * percentage / 100
        }

        runtime.addItem(
          protocolKey,
          {
            side:
              definition
                .sideApplicable
                ? side
                : null,

            grip:
              definition
                .gripApplicable
                ? grip.trim()
                : '',

            config,
          },
        )

        await persistLiveRunnerState(
          profile,
          runtime.snapshot
            .runner,
        )

        setMessage(
          'Test aggiunto alla sessione live.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Test non aggiunto.',
        )
      } finally {
        setBusy(false)
      }
    }

  const activateItem =
    async (
      itemId: string,
    ) => {
      if (!runtime) return

      setBusy(true)
      setError('')
      setMessage('')

      try {
        runtime.activateItem(
          itemId,
        )

        await persistLiveRunnerState(
          profile,
          runtime.snapshot
            .runner,
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Test non avviato.',
        )
      } finally {
        setBusy(false)
      }
    }

  const startAcquisition =
    async () => {
      if (!runtime) return

      setBusy(true)
      setError('')
      setMessage('')

      try {
        if (
          runtime.snapshot
            .runner.phase ===
          'ready'
        ) {
          runtime.beginCountdown(
            0,
          )
        }

        await runtime
          .startAcquisition()

        setMessage(
          'Acquisizione in corso.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Acquisizione non avviata.',
        )
      } finally {
        setBusy(false)
      }
    }

  const stopAcquisition =
    async () => {
      if (!runtime) return

      setBusy(true)
      setError('')
      setMessage('')

      try {
        await runtime
          .stopAcquisition()

        setMessage(
          'Acquisizione terminata. Controlla il tentativo.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Acquisizione non arrestata.',
        )
      } finally {
        setBusy(false)
      }
    }

  const selectAttempt =
    async (
      itemId: string,
      attemptId: string,
    ) => {
      if (!runtime) return

      setBusy(true)
      setError('')
      setMessage('')

      try {
        runtime.selectAttempt(
          attemptId,
        )

        await persistOfficialLiveAttempt(
          profile,
          runtime.snapshot
            .runner,
          itemId,
          attemptId,
        )

        persistedAttemptsRef
          .current
          .add(attemptId)

        setMessage(
          'Tentativo selezionato come risultato ufficiale.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Tentativo non selezionato.',
        )
      } finally {
        setBusy(false)
      }
    }

  const retry =
    () => {
      if (!runtime) return

      setError('')
      setMessage('')

      try {
        runtime.retry()
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Nuovo tentativo non preparato.',
        )
      }
    }

  const completeItem =
    async () => {
      if (!runtime) return

      setBusy(true)
      setError('')

      try {
        const current =
          runtime.snapshot.runner

        const currentItem =
          current.items.find(
            entry =>
              entry.item.id ===
              current.activeItemId,
          )

        const selectable =
          currentItem?.selectedAttemptId ??
          [...(currentItem?.attempts ?? [])]
            .reverse()
            .find(
              record =>
                record.canonical.qualityStatus !== 'INVALID',
            )?.attempt.attemptId ??
          null

        if (!currentItem || !selectable) {
          throw new Error(
            'Non esiste un tentativo valido da confermare.',
          )
        }

        if (!currentItem.selectedAttemptId) {
          runtime.selectAttempt(selectable)
        }

        await persistOfficialLiveAttempt(
          profile,
          runtime.snapshot.runner,
          currentItem.item.id,
          selectable,
        )

        runtime.completeActiveItem()

        await persistLiveRunnerState(
          profile,
          runtime.snapshot
            .runner,
        )

        setMessage(
          'Test chiuso. Puoi procedere con il successivo.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Test non chiuso.',
        )
      } finally {
        setBusy(false)
      }
    }

  const skipItem =
    async () => {
      if (!runtime) return

      if (
        !window.confirm(
          'Segnare questo test come non eseguito?',
        )
      ) {
        return
      }

      setBusy(true)
      setError('')

      try {
        runtime.skipActiveItem()

        await persistLiveRunnerState(
          profile,
          runtime.snapshot
            .runner,
        )

        setMessage(
          'Test segnato come non eseguito.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Test non saltato.',
        )
      } finally {
        setBusy(false)
      }
    }

  const finishSession =
    async () => {
      if (!runtime) return

      setBusy(true)
      setError('')
      setMessage('')

      try {
        runtime.finishSession()

        await flushLiveTestSession(
          profile,
          runtime.snapshot
            .runner,
        )

        setMessage(
          'Sessione Tindeq completata. Storico aggiornato.',
        )

        onHistoryChanged?.()
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Sessione non completata.',
        )
      } finally {
        setBusy(false)
      }
    }

  if (
    profile.role !==
      'coach' ||
    !athleteId
  ) {
    return null
  }

  return (
    <section className="live-tindeq">
      <div className="live-tindeq__heading">
        <div>
          <small>
            TEST LIVE
          </small>

          <h3>
            Tindeq Progressor
          </h3>
        </div>

        {snapshot && (
          <Tag
            tone={
              snapshot
                .connectionState ===
              'connected'
                ? 'success'
                : 'neutral'
            }
          >
            {connectionLabel(
              snapshot
                .connectionState,
            )}
          </Tag>
        )}
      </div>

      {error && (
        <div className="live-tindeq__notice live-tindeq__notice--error">
          {error}
        </div>
      )}

      {message && (
        <div className="live-tindeq__notice">
          {message}
        </div>
      )}

      {!snapshot ? (
        <Panel
          title="Nuova sessione live"
          index="L"
          action={
            <Tag tone="purple">
              TINDEQ
            </Tag>
          }
        >
          <div className="live-tindeq__start">
            <label>
              <span>
                Peso atleta
                (facoltativo)
              </span>

              <div className="input-shell">
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={bodyWeight}
                  onChange={
                    event =>
                      setBodyWeight(
                        event
                          .target
                          .value,
                      )
                  }
                  placeholder="es. 70"
                />

                <em>kg</em>
              </div>
            </label>

            <button
              type="button"
              className="button button--signal"
              disabled={busy}
              onClick={() =>
                void createSession()
              }
            >
              <Bluetooth
                size={16}
              />
              Nuova sessione Tindeq
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <Panel
            title="Dispositivo"
            index="L1"
            action={
              <Tag
                tone={
                  supported
                    ? 'success'
                    : 'warning'
                }
              >
                {transportLabel(
                  transport,
                )}
              </Tag>
            }
          >
            <div className="live-tindeq__device">
              <div>
                <small>
                  DISPOSITIVO
                </small>

                <b>
                  {snapshot
                    .deviceInfo
                    ?.name ??
                    'Tindeq Progressor'}
                </b>

                <span>
                  {connectionLabel(
                    snapshot
                      .connectionState,
                  )}
                </span>
              </div>

              <div className="live-tindeq__actions">
                {snapshot
                  .connectionState !==
                  'connected' && (
                  <button
                    type="button"
                    className="button button--signal"
                    disabled={
                      busy ||
                      !supported
                    }
                    onClick={() =>
                      void (
                        snapshot
                          .connectionState ===
                        'error'
                          ? reconnect()
                          : connect()
                      )
                    }
                  >
                    {snapshot
                      .connectionState ===
                    'error' ? (
                      <RefreshCw
                        size={15}
                      />
                    ) : (
                      <Bluetooth
                        size={15}
                      />
                    )}

                    {snapshot
                      .connectionState ===
                    'error'
                      ? 'Riconnetti'
                      : 'Connetti'}
                  </button>
                )}

                {snapshot
                  .connectionState ===
                  'connected' && (
                  <>
                    <button
                      type="button"
                      className="button button--secondary"
                      disabled={
                        busy ||
                        snapshot
                          .runner
                          .phase ===
                          'acquiring'
                      }
                      onClick={() =>
                        void tare()
                      }
                    >
                      Tara
                    </button>

                    <button
                      type="button"
                      className="button button--secondary"
                      disabled={
                        busy ||
                        snapshot
                          .runner
                          .phase ===
                          'acquiring'
                      }
                      onClick={() =>
                        void disconnect()
                      }
                    >
                      <Unplug
                        size={15}
                      />
                      Disconnetti
                    </button>
                  </>
                )}
              </div>
            </div>
          </Panel>

          {snapshot.runner
            .phase ===
            'setup' &&
            snapshot.runner
              .session
              .status !==
              'completed' && (
              <Panel
                title="Aggiungi test"
                index="L2"
              >
                <div className="live-tindeq__builder">
                  <label>
                    <span>
                      Protocollo
                    </span>

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

                          const nextDefinition =
                            getTestDefinition(
                              next,
                            )

                          if (
                            !nextDefinition
                              ?.gripApplicable
                          ) {
                            setGrip('')
                          }

                          setMaximumForceN('')
                          setTargetPercent('60')
                        }
                      }
                    >
                      {liveDefinitions.map(
                        item => (
                          <option
                            key={
                              item.key
                            }
                            value={
                              item.key
                            }
                          >
                            {
                              item.name
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  {definition
                    ?.sideApplicable && (
                    <label>
                      <span>
                        Lato
                      </span>

                      <select
                        value={side}
                        onChange={
                          event =>
                            setSide(
                              event
                                .target
                                .value as
                                LiveSide,
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

                  {definition
                    ?.gripApplicable && (
                    <label>
                      <span>
                        Presa / setup
                      </span>

                      <input
                        value={grip}
                        onChange={
                          event =>
                            setGrip(
                              event
                                .target
                                .value,
                            )
                        }
                        placeholder="es. 20 mm"
                      />
                    </label>
                  )}

                  {TARGET_PROTOCOLS
                    .has(
                      protocolKey,
                    ) && (
                    <>
                      <label>
                        <span>
                          Massimale MVC
                        </span>

                        <div className="input-shell">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={maximumForceN}
                            onChange={event =>
                              setMaximumForceN(event.target.value)
                            }
                            placeholder="es. 400"
                          />

                          <em>N</em>
                        </div>
                      </label>

                      <label>
                        <span>
                          Target del massimale
                        </span>

                        <div className="input-shell">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            value={targetPercent}
                            onChange={event =>
                              setTargetPercent(event.target.value)
                            }
                          />

                          <em>%</em>
                        </div>
                      </label>

                      <div className="live-tindeq__target-preview">
                        <small>ZONA LIVE ±10%</small>
                        <b>
                          {Number(maximumForceN) > 0 &&
                          Number(targetPercent) > 0
                            ? `${(
                                Number(maximumForceN) *
                                Number(targetPercent) /
                                100
                              ).toFixed(1)} N`
                            : '—'}
                        </b>
                      </div>
                    </>
                  )}

                  {protocolKey ===
                    'rfd' && (
                    <label>
                      <span>
                        Finestra RFD
                      </span>

                      <div className="input-shell">
                        <input
                          type="number"
                          min="1"
                          step="50"
                          value={
                            rfdWindowMs
                          }
                          onChange={
                            event =>
                              setRfdWindowMs(
                                event
                                  .target
                                  .value,
                              )
                          }
                        />

                        <em>ms</em>
                      </div>
                    </label>
                  )}

                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={busy}
                    onClick={() =>
                      void addItem()
                    }
                  >
                    <Plus
                      size={15}
                    />
                    Aggiungi test
                  </button>
                </div>
              </Panel>
            )}

          <Panel
            className={activeItem ? 'live-tindeq__test-page' : undefined}
            title={activeDefinition?.name ?? 'Sessione live'}
            index={activeItem ? `T${activeItem.item.itemOrder}` : 'L3'}
            action={
              <Tag tone="purple">
                {
                  snapshot
                    .runner
                    .items
                    .length
                } TEST
              </Tag>
            }
          >
            {!snapshot.runner
              .items.length && (
              <p className="live-tindeq__empty">
                Aggiungi almeno un
                test alla sessione.
              </p>
            )}

            {!activeItem && (
            <div className="live-tindeq__items">
              {snapshot.runner
                .items
                .map(
                  entry => {
                    const itemDefinition =
                      getTestDefinition(
                        entry.item
                          .protocolKey,
                      )

                    const isActive =
                      snapshot
                        .runner
                        .activeItemId ===
                      entry.item.id

                    return (
                      <article
                        className={
                          'live-tindeq__item' +
                          (
                            isActive
                              ? ' is-active'
                              : ''
                          )
                        }
                        key={
                          entry.item.id
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

                            <b>
                              {
                                itemDefinition
                                  ?.name
                              }
                            </b>

                            <span>
                              {[
                                entry.item
                                  .side ===
                                'right'
                                  ? 'DX'
                                  : entry.item
                                      .side ===
                                    'left'
                                    ? 'SX'
                                    : entry.item
                                        .side ===
                                      'bilateral'
                                      ? 'Bilaterale'
                                      : '',

                                entry.item
                                  .grip,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  ' - ',
                                )}
                            </span>
                          </div>

                          <Tag
                            tone={
                              entry.item
                                .status ===
                              'completed'
                                ? 'success'
                                : entry.item
                                    .status ===
                                  'skipped'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {itemStatusLabel(
                              entry.item
                                .status,
                            )}
                          </Tag>
                        </header>

                        {entry.attempts
                          .length >
                          0 && (
                          <div className="live-tindeq__attempts">
                            {entry.attempts.map(
                              (
                                record,
                                index,
                              ) => {
                                const primary =
                                  primaryCanonicalMetric(
                                    record
                                      .canonical,
                                  ) ??
                                  record
                                    .canonical
                                    .metrics[0] ??
                                  null

                                const selected =
                                  entry
                                    .selectedAttemptId ===
                                  record
                                    .attempt
                                    .attemptId

                                return (
                                  <div
                                    key={
                                      record
                                        .attempt
                                        .attemptId
                                    }
                                  >
                                    <span>
                                      Tentativo{' '}
                                      {index +
                                        1}
                                    </span>

                                    <b>
                                      {primary
                                        ? `${primary.value.toLocaleString(
                                            'it-IT',
                                            {
                                              maximumFractionDigits:
                                                2,
                                            },
                                          )} ${primary.unit}`
                                        : 'Misura acquisita'}
                                    </b>

                                    <Tag
                                      tone={qualityTone(
                                        record
                                          .canonical
                                          .qualityStatus,
                                      )}
                                    >
                                      {
                                        record
                                          .canonical
                                          .qualityStatus
                                      }
                                    </Tag>

                                    <button
                                      type="button"
                                      className="text-button"
                                      disabled={
                                        busy ||
                                        record
                                          .canonical
                                          .qualityStatus ===
                                          'INVALID' ||
                                        selected
                                      }
                                      onClick={() =>
                                        void selectAttempt(
                                          entry
                                            .item
                                            .id,

                                          record
                                            .attempt
                                            .attemptId,
                                        )
                                      }
                                    >
                                      {selected
                                        ? 'Ufficiale'
                                        : 'Seleziona'}
                                    </button>
                                  </div>
                                )
                              },
                            )}
                          </div>
                        )}

                        {!isActive &&
                          entry.item
                            .status ===
                            'pending' &&
                          snapshot.runner
                            .phase ===
                            'setup' && (
                            <button
                              type="button"
                              className="button button--signal"
                              disabled={
                                busy
                              }
                              onClick={() =>
                                void activateItem(
                                  entry
                                    .item
                                    .id,
                                )
                              }
                            >
                              Avvia questo test
                            </button>
                          )}
                      </article>
                    )
                  },
                )}
            </div>
            )}

            {activeItem && (
              <div className="live-tindeq__active">
                <div className="live-tindeq__test-page-head">
                  <div>
                    <small>TEST IN ESECUZIONE</small>
                    <h2>{activeDefinition?.name ?? 'Test Tindeq'}</h2>
                    <p>
                      {[activeItem.item.grip,
                        activeItem.item.side === 'right'
                          ? 'DX'
                          : activeItem.item.side === 'left'
                            ? 'SX'
                            : activeItem.item.side === 'bilateral'
                              ? 'Bilaterale'
                              : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {activeTargetN !== null && (
                    <Tag tone="success">
                      TARGET {activeTargetN.toFixed(1)} N
                    </Tag>
                  )}
                </div>

                <div className="live-tindeq__force">
                  <div>
                    <small>
                      MASSIMO
                    </small>

                    <strong>
                      {formatForce(
                        snapshot.force
                          .peakForceN,
                      )}
                      <span>
                        {' '}N
                      </span>
                    </strong>
                  </div>

                  <div>
                    <small>
                      MEDIA
                    </small>

                    <strong>
                      {formatForce(
                        activeAverageForce,
                      )}
                      <span>
                        {' '}N
                      </span>
                    </strong>
                  </div>

                  <div>
                    <small>
                      ATTUALE
                    </small>

                    <strong>
                      {formatForce(
                        snapshot.force.currentForceN,
                      )}
                      <span>{' '}N</span>
                    </strong>
                  </div>
                </div>

                <LiveForceChart
                  points={snapshot.curve}
                  targetN={activeTargetN}
                  tolerancePercent={activeTargetTolerance}
                />

                <p className="live-tindeq__sample-count">
                  {snapshot.force.sampleCount} campioni acquisiti
                </p>

                <div className="live-tindeq__actions">
                  {snapshot.runner
                    .phase ===
                    'ready' && (
                    <>
                      <button
                        type="button"
                        className="button button--signal"
                        disabled={
                          busy ||
                          snapshot
                            .connectionState !==
                            'connected'
                        }
                        onClick={() =>
                          void startAcquisition()
                        }
                      >
                        <Bluetooth
                          size={15}
                        />
                        Avvia acquisizione
                      </button>

                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={busy}
                        onClick={() =>
                          void skipItem()
                        }
                      >
                        <X
                          size={15}
                        />
                        Non eseguito
                      </button>
                    </>
                  )}

                  {snapshot.runner
                    .phase ===
                    'armed' && (
                    <button
                      type="button"
                      className="button button--signal"
                      disabled={
                        busy ||
                        snapshot
                          .connectionState !==
                          'connected'
                      }
                      onClick={() =>
                        void startAcquisition()
                      }
                    >
                      Avvia acquisizione
                    </button>
                  )}

                  {snapshot.runner
                    .phase ===
                    'acquiring' && (
                    <button
                      type="button"
                      className="button button--signal"
                      disabled={busy}
                      onClick={() =>
                        void stopAcquisition()
                      }
                    >
                      <Square
                        size={15}
                      />
                      Stop
                    </button>
                  )}

                  {snapshot.runner
                    .phase ===
                    'review' && (
                    <>
                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={busy}
                        onClick={
                          retry
                        }
                      >
                        <RotateCcw
                          size={15}
                        />
                        Ripeti
                      </button>

                      <button
                        type="button"
                        className="button button--signal"
                        disabled={
                          busy ||
                          activeItem.attempts.every(
                            record =>
                              record.canonical.qualityStatus === 'INVALID',
                          )
                        }
                        onClick={() =>
                          void completeItem()
                        }
                      >
                        <Check
                          size={15}
                        />
                        Conferma test
                      </button>

                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={busy}
                        onClick={() =>
                          void skipItem()
                        }
                      >
                        <X
                          size={15}
                        />
                        Non eseguito
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {allClosed &&
              snapshot.runner
                .phase ===
                'setup' &&
              snapshot.runner
                .session
                .status !==
                'completed' && (
                <div className="live-tindeq__finish">
                  <button
                    type="button"
                    className="button button--signal"
                    disabled={busy}
                    onClick={() =>
                      void finishSession()
                    }
                  >
                    <Send
                      size={15}
                    />
                    Termina sessione Tindeq
                  </button>
                </div>
              )}

            {snapshot.runner
              .session
              .status ===
              'completed' && (
              <div className="live-tindeq__completed">
                <Check
                  size={17}
                />
                Sessione completata.
                I risultati ufficiali
                sono nello storico.
              </div>
            )}
          </Panel>
        </>
      )}
    </section>
  )
}
