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
  Video,
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

import { getTestDefinition } from './testCatalog'

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

import {
  ensureRemoteTestLibrary,
  updateRemoteTemplateVideo,
} from './remoteTestLibraryRepository'

import {
  remoteOutputSchemaFromConfig,
  type RemoteOutputField,
  type RemoteTestTemplate,
} from './remoteTestTemplates'

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
  side: 'left' | 'right' | 'bilateral' | null,
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

function configLabel(config: Record<string, unknown>) {
  const labels: string[] = []
  if (config.beam === 'high') labels.push('Trave alto')
  if (config.beam === 'low') labels.push('Trave basso')
  if (config.laterality === 'right_left') labels.push('DX + SX')
  if (config.laterality === 'bilateral') labels.push('Bilaterale')
  return labels.join(' · ')
}

function itemName(entry: RemoteTestAssignmentState['items'][number]) {
  return entry.template?.name ??
    (typeof entry.item.config.templateName === 'string' ? entry.item.config.templateName : null) ??
    getTestDefinition(entry.item.protocolKey)?.name ??
    'Test a distanza'
}

function itemFields(entry: RemoteTestAssignmentState['items'][number]): RemoteOutputField[] {
  const configured = remoteOutputSchemaFromConfig(entry.item.config)
  if (configured.length) return configured

  const definition = getTestDefinition(entry.item.protocolKey)
  const legacyMetrics = definition?.metrics.filter(metric =>
    metric.key === definition.primaryMetricKey,
  ) ?? []

  return legacyMetrics.map(metric => ({
    key: metric.key,
    label: metric.label,
    type: metric.dimension === 'count' ? 'integer' : 'number',
    unit: metric.unit as RemoteOutputField['unit'],
    min: Number.NEGATIVE_INFINITY,
    required: false,
  }))
}

function embedVideoUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v')
      return id ? `https://www.youtube.com/embed/${id}` : url
    }
    if (parsed.hostname === 'youtu.be') return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`
    if (parsed.hostname.includes('vimeo.com')) return `https://player.vimeo.com/video/${parsed.pathname.split('/').filter(Boolean).at(-1)}`
  } catch {
    return url
  }
  return url
}

function usesVideoEmbed(url: string) {
  return /(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(url)
}

function hasRequiredValues(entry: RemoteTestAssignmentState['items'][number]) {
  const required = itemFields(entry).filter(field => field.required)
  return required.length
    ? required.every(field => entry.values.some(value => value.metricKey === field.key))
    : entry.values.length > 0
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

  const [templates, setTemplates] = useState<RemoteTestTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [beam, setBeam] = useState<'high' | 'low'>('high')
  const [laterality, setLaterality] = useState<'right_left' | 'bilateral'>('right_left')
  const [showVideoLibrary, setShowVideoLibrary] = useState(false)
  const [videoTemplateId, setVideoTemplateId] = useState('')
  const [videoUrl, setVideoUrl] = useState('')

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

  const selectedTemplate = useMemo(
    () => templates.find(template => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  )

  const videoTemplate = useMemo(
    () => templates.find(template => template.id === videoTemplateId) ?? null,
    [templates, videoTemplateId],
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

  useEffect(() => {
    if (profile.role !== 'coach') return
    let active = true

    ensureRemoteTestLibrary(profile)
      .then(next => {
        if (!active) return
        setTemplates(next)
        setSelectedTemplateId(current => current || next[0]?.id || '')
        setVideoTemplateId(current => current || next[0]?.id || '')
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : 'Libreria test non caricata.')
      })

    return () => {
      active = false
    }
  }, [profile])

  useEffect(() => {
    setVideoUrl(videoTemplate?.videoUrl ?? '')
  }, [videoTemplate])

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
        !selectedTemplate
      ) {
        return
      }

      try {
        const next =
          addRemoteTestItem(
            profile,
            coachDraft,
            selectedTemplate.protocolKey,
            {
              itemId:
                crypto.randomUUID(),

              template: selectedTemplate,
              beam: selectedTemplate.availableSettings.beam ? beam : undefined,
              laterality: selectedTemplate.availableSettings.laterality ? laterality : undefined,
            },
          )

        setCoachDraft(next)
        setError('')
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Test non aggiunto.',
        )
      }
    }

  const saveTemplateVideo = async () => {
    if (!videoTemplate) return
    setBusy(true)
    setError('')
    try {
      const normalized = await updateRemoteTemplateVideo(profile, videoTemplate.id, videoUrl)
      setTemplates(current => current.map(template =>
        template.id === videoTemplate.id ? { ...template, videoUrl: normalized } : template,
      ))
      setMessage('Video tutorial aggiornato nella libreria.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Video tutorial non aggiornato.')
    } finally {
      setBusy(false)
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
          'Confermi che questo test non verrà eseguito?',
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

        {profile.role === 'coach' && (
          <div className="remote-tests__actions">
            <button className="button" type="button" onClick={() => setShowVideoLibrary(current => !current)}>
              <Video size={16} />
              Video tutorial
            </button>
            {!coachDraft && (
              <button className="button button--signal" disabled={busy} onClick={createCoachDraft}>
                <Plus size={16} />
                Nuova batteria
              </button>
            )}
          </div>
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

      {profile.role === 'coach' && showVideoLibrary && (
        <Panel className="remote-test-builder" title="Video tutorial della libreria" index="V">
          <p>Il video viene associato al template una sola volta e recuperato automaticamente in ogni assegnazione.</p>
          <div className="remote-test-builder__controls">
            <label>
              <span>Template</span>
              <select value={videoTemplateId} onChange={event => setVideoTemplateId(event.target.value)}>
                {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <label className="remote-test-builder__video-url">
              <span>Video URL</span>
              <input type="url" value={videoUrl} placeholder="https://…" onChange={event => setVideoUrl(event.target.value)} />
            </label>
            <button className="button button--signal" type="button" disabled={busy || !videoTemplate} onClick={() => void saveTemplateVideo()}>
              <Save size={15} />
              Salva video
            </button>
          </div>
        </Panel>
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
                  value={selectedTemplateId}
                  onChange={event => setSelectedTemplateId(event.target.value)}
                >
                  {templates.map(
                    template => (
                      <option
                        key={template.id}
                        value={template.id}
                      >
                        {template.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              {selectedTemplate?.availableSettings.beam && (
                <label>
                  <span>Trave</span>
                  <select value={beam} onChange={event => setBeam(event.target.value as 'high' | 'low')}>
                    <option value="high">Alto</option>
                    <option value="low">Basso</option>
                  </select>
                </label>
              )}

              {selectedTemplate?.availableSettings.laterality && (
                <label>
                  <span>Modalità</span>
                  <select value={laterality} onChange={event => setLaterality(event.target.value as 'right_left' | 'bilateral')}>
                    <option value="right_left">DX + SX</option>
                    <option value="bilateral">Bilaterale</option>
                  </select>
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
                  l'atleta dovrà
                  eseguire in autonomia.
                </p>
              ) : (
                coachDraft.items.map(
                  entry => {
                    return (
                      <div
                        className="remote-test-builder__item"
                        key={
                          entry.item.id
                        }
                      >
                        <div>
                          <b>
                            {itemName(entry)}
                          </b>

                          <span>
                            {configLabel(entry.item.config)}
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
                          return (
                            <div
                              key={
                                entry.item
                                  .id
                              }
                            >
                              <div>
                                <b>{itemName(entry)}</b>

                                <span>
                                  {configLabel(entry.item.config) || sideLabel(entry.item.side)}
                                </span>

                                {entry.item.status === 'completed' && entry.values.map(value => (
                                  <strong className="remote-assignment__result" key={value.metricKey}>
                                    {value.metricLabel}: {value.value} {value.unit}
                                  </strong>
                                ))}
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
                        {assignment.items
                          .filter(entry => entry.item.status !== 'completed' && entry.item.status !== 'skipped')
                          .slice(0, 1)
                          .map(
                          entry => {
                            const fields = itemFields(entry)
                            const video = entry.template?.videoUrl ?? ''
                            const instruction = typeof entry.item.config.instruction === 'string'
                              ? entry.item.config.instruction
                              : entry.template?.instruction ?? ''

                            return (
                              <article
                                className="remote-assignment__item remote-assignment__test-page"
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

                                    <h4>{itemName(entry)}</h4>

                                    <span>
                                      {configLabel(entry.item.config) || sideLabel(entry.item.side)}
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

                                <section className="remote-assignment__video">
                                  <small>VIDEO TUTORIAL</small>
                                  {video ? (
                                    usesVideoEmbed(video) ? (
                                      <iframe src={embedVideoUrl(video)} title={`Video ${itemName(entry)}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                                    ) : (
                                      <video src={video} controls preload="metadata" />
                                    )
                                  ) : (
                                    <p>Video tutorial non ancora disponibile. Contatta il coach prima di eseguire il test.</p>
                                  )}
                                </section>

                                {instruction && <p className="remote-assignment__instruction">{instruction}</p>}

                                <div className="remote-assignment__metric-grid">
                                  {fields.map(
                                    metric => (
                                      <label key={metric.key}>
                                        <span>{metric.label}</span>
                                        <div className="remote-assignment__metric-input">
                                          <input
                                            type="number"
                                            min={Number.isFinite(metric.min) ? metric.min : undefined}
                                            step={metric.type === 'integer' ? 1 : 'any'}
                                            inputMode="decimal"
                                            value={metricValue(assignment, entry.item.id, metric.key)}
                                            onChange={event => updateMetric(assignment, entry.item.id, metric.key, event.target.value)}
                                          />
                                          <b>{metric.unit}</b>
                                        </div>
                                      </label>
                                    ),
                                  )}
                                </div>

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

                                <div className="remote-tests__actions">
                                    <button
                                      className="button button--signal"
                                      type="button"
                                      disabled={
                                        busy ||
                                        !hasRequiredValues(entry)
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
                                      Completa test
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
