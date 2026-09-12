import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  RefreshCw,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

import type {
  AppProfile,
} from '../onboarding/types'

import {
  getTestDefinition,
} from '../tests/testCatalog'

import {
  calculateDerivedSetTargets,
  chooseTestReference,
  compatibleTestReference,
  formatDerivedTarget,
  hasNewerTest,
  type DerivedTarget,
  type TestOutcomeReference,
  type TestTargetReference,
} from './derivedTargets'

import {
  clearExerciseTestTarget,
  loadAthleteTestReferences,
  loadExerciseTestTarget,
  saveExerciseTestTarget,
} from './testTargetRepository'

import {
  derivedTargetAsReference,
  findReferenceGroupForTarget,
  groupTestReferences,
  targetUnitsForReference,
} from './testTargetUi'

function sideLabel(
  side: string | null,
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

function unitLabel(
  unit: string,
) {
  if (
    unit ===
    'kg_external'
  ) {
    return 'kg esterni'
  }

  if (
    unit ===
    'kg_total'
  ) {
    return 'kg totali'
  }

  return unit
}

function resultDate(
  result:
    TestOutcomeReference,
) {
  return new Intl.DateTimeFormat(
    'it-IT',
    {
      day:
        '2-digit',

      month:
        '2-digit',

      year:
        'numeric',
    },
  ).format(
    new Date(
      result.measuredAt,
    ),
  )
}

function resizePercentages(
  current: string[],
  count: number,
) {
  const safeCount =
    Math.max(
      1,
      count,
    )

  const fallback =
    current.at(-1) ??
    '80'

  return Array.from(
    {
      length:
        safeCount,
    },

    (
      _,
      index,
    ) =>
      current[index] ??
      fallback,
  )
}

export function ExerciseTestTargetPanel({
  profile,
  athleteId,
  exerciseId,
  setCount,
}: {
  profile: AppProfile
  athleteId: string
  exerciseId: string
  setCount: number
}) {
  const [
    references,
    setReferences,
  ] = useState<
    TestOutcomeReference[]
  >([])

  const [
    lockedTarget,
    setLockedTarget,
  ] = useState<
    DerivedTarget | null
  >(null)

  const [
    selectedGroupId,
    setSelectedGroupId,
  ] = useState('')

  const [
    referenceType,
    setReferenceType,
  ] = useState<
    TestTargetReference
  >('latest_valid')

  const [
    specificResultId,
    setSpecificResultId,
  ] = useState('')

  const [
    percentages,
    setPercentages,
  ] = useState<
    string[]
  >(
    Array.from(
      {
        length:
          Math.max(
            1,
            setCount,
          ),
      },
      () => '80',
    ),
  )

  const [
    targetUnit,
    setTargetUnit,
  ] = useState('kg')

  const [
    state,
    setState,
  ] = useState<
    'loading' |
    'idle' |
    'saving'
  >('loading')

  const [
    error,
    setError,
  ] = useState('')

  const [
    message,
    setMessage,
  ] = useState('')

  const groups =
    useMemo(
      () =>
        groupTestReferences(
          references,
        ),
      [references],
    )

  const selectedGroup =
    groups.find(
      group =>
        group.id ===
        selectedGroupId,
    ) ??
    groups[0] ??
    null

  const unitOptions =
    selectedGroup
      ? targetUnitsForReference(
          selectedGroup
            .representative
            .unit,
        )
      : []

  useEffect(
    () => {
      let active = true

      setState('loading')
      setError('')
      setMessage('')

      Promise.all([
        loadAthleteTestReferences(
          profile,
          athleteId,
        ),

        loadExerciseTestTarget(
          profile,
          exerciseId,
        ),
      ])
        .then(
          (
            [
              nextReferences,
              nextLocked,
            ],
          ) => {
            if (!active) {
              return
            }

            setReferences(
              nextReferences,
            )

            setLockedTarget(
              nextLocked,
            )

            const nextGroups =
              groupTestReferences(
                nextReferences,
              )

            if (nextLocked) {
              const group =
                findReferenceGroupForTarget(
                  nextGroups,
                  nextLocked,
                )

              setSelectedGroupId(
                group?.id ??
                nextGroups[0]
                  ?.id ??
                '',
              )

              setReferenceType(
                nextLocked.reference,
              )

              setSpecificResultId(
                nextLocked
                  .resultId ??
                '',
              )

              setTargetUnit(
                nextLocked
                  .targetUnit,
              )

              setPercentages(
                resizePercentages(
                  nextLocked
                    .setTargets
                    .map(
                      item =>
                        String(
                          item.percentage,
                        ),
                    ),

                  setCount,
                ),
              )
            } else {
              const first =
                nextGroups[0]

              setSelectedGroupId(
                first?.id ??
                '',
              )

              setSpecificResultId(
                first
                  ?.results[0]
                  ?.resultId ??
                '',
              )

              setTargetUnit(
                first
                  ? targetUnitsForReference(
                      first
                        .representative
                        .unit,
                    )[0] ??
                    ''
                  : '',
              )

              setPercentages(
                Array.from(
                  {
                    length:
                      Math.max(
                        1,
                        setCount,
                      ),
                  },
                  () => '80',
                ),
              )
            }
          },
        )
        .catch(
          reason => {
            if (!active) {
              return
            }

            setError(
              reason instanceof
                Error
                ? reason.message
                : 'Risultati test non disponibili.',
            )
          },
        )
        .finally(
          () => {
            if (active) {
              setState('idle')
            }
          },
        )

      return () => {
        active = false
      }
    },
    [
      profile.userId,
      athleteId,
      exerciseId,
    ],
  )

  useEffect(
    () => {
      setPercentages(
        current =>
          resizePercentages(
            current,
            setCount,
          ),
      )
    },
    [setCount],
  )

  useEffect(
    () => {
      if (
        !selectedGroup
      ) {
        return
      }

      const options =
        targetUnitsForReference(
          selectedGroup
            .representative
            .unit,
        )

      if (
        !options.includes(
          targetUnit,
        )
      ) {
        setTargetUnit(
          options[0] ??
          '',
        )
      }

      if (
        !selectedGroup
          .results
          .some(
            result =>
              result.resultId ===
              specificResultId,
          )
      ) {
        setSpecificResultId(
          selectedGroup
            .results[0]
            ?.resultId ??
          '',
        )
      }
    },
    [
      selectedGroupId,
      selectedGroup,
      specificResultId,
      targetUnit,
    ],
  )

  const preview =
    useMemo(
      () => {
        if (
          !selectedGroup ||
          !targetUnit
        ) {
          return {
            target:
              null,

            error:
              '',
          }
        }

        const parsed =
          resizePercentages(
            percentages,
            setCount,
          ).map(
            value =>
              Number(value),
          )

        if (
          parsed.some(
            value =>
              !Number.isFinite(
                value,
              ) ||
              value <= 0,
          )
        ) {
          return {
            target:
              null,

            error:
              'Inserisci una percentuale valida per ogni serie.',
          }
        }

        const source =
          chooseTestReference(
            selectedGroup
              .results,

            referenceType,

            referenceType ===
              'specific_result'
              ? specificResultId
              : undefined,
          )

        if (!source) {
          return {
            target:
              null,

            error:
              referenceType ===
                'specific_result'
                ? 'Seleziona un risultato specifico.'
                : 'Non ci sono risultati VALID utilizzabili per questo criterio.',
          }
        }

        try {
          return {
            target:
              calculateDerivedSetTargets(
                source,
                parsed,
                {
                  prescriptionUnit:
                    targetUnit,

                  reference:
                    referenceType,
                },
              ),

            error:
              '',
          }
        } catch (
          reason
        ) {
          return {
            target:
              null,

            error:
              reason instanceof
                Error
                ? reason.message
                : 'Target non calcolabile.',
          }
        }
      },
      [
        selectedGroup,
        percentages,
        setCount,
        referenceType,
        specificResultId,
        targetUnit,
      ],
    )

  const newerAvailable =
    lockedTarget
      ? hasNewerTest(
          lockedTarget,
          references,
        )
      : false

  const setCountChanged =
    Boolean(
      lockedTarget &&
      lockedTarget
        .setTargets
        .length !==
        Math.max(
          1,
          setCount,
        ),
    )

  const saveTarget =
    async () => {
      if (!preview.target) {
        setError(
          preview.error ||
          'Target non valido.',
        )
        return
      }

      setState('saving')
      setError('')
      setMessage('')

      try {
        await saveExerciseTestTarget(
          profile,
          exerciseId,
          preview.target,
        )

        setLockedTarget(
          preview.target,
        )

        setMessage(
          'Target salvato. Il riferimento resta bloccato finche non scegli esplicitamente di ricalcolarlo.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Target non salvato.',
        )
      } finally {
        setState('idle')
      }
    }

  const recalculateFromLatest =
    async () => {
      if (!lockedTarget) {
        return
      }

      const lockedReference =
        derivedTargetAsReference(
          lockedTarget,
        )

      const compatible =
        references.filter(
          result =>
            compatibleTestReference(
              lockedReference,
              result,
            ),
        )

      const latest =
        chooseTestReference(
          compatible,
          'latest_valid',
        )

      if (!latest) {
        setError(
          'Nessun nuovo risultato VALID compatibile.',
        )
        return
      }

      const next =
        calculateDerivedSetTargets(
          latest,

          lockedTarget
            .setTargets
            .map(
              item =>
                item.percentage,
            ),

          {
            prescriptionUnit:
              lockedTarget
                .targetUnit,

            reference:
              'latest_valid',
          },
        )

      setState('saving')
      setError('')
      setMessage('')

      try {
        await saveExerciseTestTarget(
          profile,
          exerciseId,
          next,
        )

        setLockedTarget(
          next,
        )

        setReferenceType(
          'latest_valid',
        )

        setPercentages(
          resizePercentages(
            next.setTargets
              .map(
                item =>
                  String(
                    item.percentage,
                  ),
              ),

            setCount,
          ),
        )

        const group =
          groups.find(
            current =>
              compatibleTestReference(
                current
                  .representative,
                latest,
              ),
          )

        if (group) {
          setSelectedGroupId(
            group.id,
          )
        }

        setMessage(
          'Target ricalcolato esplicitamente con il retest piu recente.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Ricalcolo non riuscito.',
        )
      } finally {
        setState('idle')
      }
    }

  const clearTarget =
    async () => {
      if (
        !window.confirm(
          'Rimuovere il collegamento tra questo esercizio e il test?',
        )
      ) {
        return
      }

      setState('saving')
      setError('')
      setMessage('')

      try {
        await clearExerciseTestTarget(
          profile,
          exerciseId,
        )

        setLockedTarget(
          null,
        )

        setMessage(
          'Target da test rimosso. La prescrizione manuale resta disponibile.',
        )
      } catch (
        reason
      ) {
        setError(
          reason instanceof
            Error
            ? reason.message
            : 'Target non rimosso.',
        )
      } finally {
        setState('idle')
      }
    }

  if (state === 'loading') {
    return (
      <section className="builder-test-target">
        <small>
          CARICO DA TEST
        </small>

        <p>
          Carico i risultati
          disponibili...
        </p>
      </section>
    )
  }

  return (
    <section className="builder-test-target">
      <header className="builder-test-target__head">
        <div>
          <small>
            CARICO DA TEST
          </small>

          <b>
            Prescrizione %
            individuale
          </b>
        </div>

        {lockedTarget && (
          <span className="builder-test-target__lock">
            SNAPSHOT
          </span>
        )}
      </header>

      {!groups.length ? (
        <p className="builder-test-target__empty">
          Nessun risultato di forza
          compatibile disponibile per
          questo atleta.
        </p>
      ) : (
        <>
          <label>
            <span>
              Test / metrica
            </span>

            <select
              value={
                selectedGroup?.id ??
                ''
              }
              onChange={
                event => {
                  setSelectedGroupId(
                    event
                      .target
                      .value,
                  )

                  setError('')
                  setMessage('')
                }
              }
            >
              {groups.map(
                group => {
                  const result =
                    group
                      .representative

                  const definition =
                    getTestDefinition(
                      result
                        .protocolKey ??
                      '',
                    )

                  const details = [
                    definition
                      ?.name ??
                    result
                      .protocolKey,

                    result
                      .metricLabel,

                    sideLabel(
                      result.side,
                    ),

                    result.grip,

                    result.unit,
                  ]
                    .filter(
                      Boolean,
                    )
                    .join(
                      ' - ',
                    )

                  return (
                    <option
                      key={
                        group.id
                      }
                      value={
                        group.id
                      }
                    >
                      {details}
                    </option>
                  )
                },
              )}
            </select>
          </label>

          <div className="builder-test-target__grid">
            <label>
              <span>
                Riferimento
              </span>

              <select
                value={
                  referenceType
                }
                onChange={
                  event =>
                    setReferenceType(
                      event
                        .target
                        .value as
                        TestTargetReference,
                    )
                }
              >
                <option value="latest_valid">
                  Ultimo VALID
                </option>

                <option value="personal_best">
                  Personal best
                </option>

                <option value="specific_result">
                  Risultato specifico
                </option>
              </select>
            </label>

            <label>
              <span>
                Unita prescrizione
              </span>

              <select
                value={
                  targetUnit
                }
                onChange={
                  event =>
                    setTargetUnit(
                      event
                        .target
                        .value,
                    )
                }
              >
                {unitOptions.map(
                  unit => (
                    <option
                      key={unit}
                      value={unit}
                    >
                      {unitLabel(
                        unit,
                      )}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          {referenceType ===
            'specific_result' &&
            selectedGroup && (
              <label>
                <span>
                  Risultato
                  specifico
                </span>

                <select
                  value={
                    specificResultId
                  }
                  onChange={
                    event =>
                      setSpecificResultId(
                        event
                          .target
                          .value,
                      )
                  }
                >
                  {selectedGroup
                    .results
                    .map(
                      result => (
                        <option
                          key={
                            result
                              .resultId
                          }
                          value={
                            result
                              .resultId
                          }
                        >
                          {resultDate(
                            result,
                          )}
                          {' - '}
                          {result.value}
                          {' '}
                          {result.unit}
                          {' - '}
                          {
                            result
                              .qualityStatus
                          }
                        </option>
                      ),
                    )}
                </select>
              </label>
            )}

          <div className="builder-test-target__sets">
            <span>
              Percentuale per
              serie
            </span>

            {resizePercentages(
              percentages,
              setCount,
            ).map(
              (
                value,
                index,
              ) => (
                <label
                  key={
                    index
                  }
                >
                  <b>
                    S
                    {index + 1}
                  </b>

                  <div className="input-shell">
                    <input
                      type="number"
                      min="1"
                      max="300"
                      step="1"
                      value={value}
                      onChange={
                        event =>
                          setPercentages(
                            current => {
                              const next =
                                resizePercentages(
                                  current,
                                  setCount,
                                )

                              next[
                                index
                              ] =
                                event
                                  .target
                                  .value

                              return next
                            },
                          )
                      }
                    />

                    <em>%</em>
                  </div>
                </label>
              ),
            )}
          </div>

          {preview.target && (
            <div className="builder-test-target__preview">
              <div>
                <small>
                  RIFERIMENTO
                </small>

                <b>
                  {
                    preview
                      .target
                      .metricLabel
                  }
                  {' '}
                  {
                    preview
                      .target
                      .sourceValue
                  }
                  {' '}
                  {
                    preview
                      .target
                      .sourceUnit
                  }
                </b>

                <span>
                  {
                    preview
                      .target
                      .testedAt
                  }
                  {
                    preview
                      .target
                      .side
                      ? ` - ${sideLabel(
                          preview
                            .target
                            .side,
                        )}`
                      : ''
                  }
                </span>
              </div>

              <ol>
                {preview
                  .target
                  .setTargets
                  .map(
                    item => (
                      <li
                        key={
                          item
                            .setNumber
                        }
                      >
                        <span>
                          Serie{' '}
                          {
                            item
                              .setNumber
                          }
                        </span>

                        <b>
                          {
                            item
                              .percentage
                          }
                          %
                        </b>

                        <strong>
                          {formatDerivedTarget(
                            item
                              .calculatedTarget,
                          )}
                          {' '}
                          {unitLabel(
                            item
                              .targetUnit,
                          )}
                        </strong>
                      </li>
                    ),
                  )}
              </ol>
            </div>
          )}

          {preview.error && (
            <div className="builder-test-target__warning">
              <TriangleAlert
                size={16}
              />

              <span>
                {
                  preview.error
                }
              </span>
            </div>
          )}

          {lockedTarget && (
            <div className="builder-test-target__snapshot">
              <div>
                <small>
                  SNAPSHOT ATTIVO
                </small>

                <b>
                  {
                    lockedTarget
                      .metricLabel
                  }
                  {' '}
                  {
                    lockedTarget
                      .sourceValue
                  }
                  {' '}
                  {
                    lockedTarget
                      .sourceUnit
                  }
                </b>

                <span>
                  Test del{' '}
                  {
                    lockedTarget
                      .testedAt
                  }
                </span>
              </div>

              <span>
                I carichi non cambiano
                automaticamente dopo
                un retest.
              </span>
            </div>
          )}

          {newerAvailable && (
            <div className="builder-test-target__warning builder-test-target__warning--newer">
              <TriangleAlert
                size={17}
              />

              <div>
                <b>
                  Retest piu recente
                  disponibile
                </b>

                <span>
                  Il programma resta
                  invariato finche non
                  scegli di
                  ricalcolarlo.
                </span>
              </div>

              <button
                type="button"
                className="text-button"
                disabled={
                  state ===
                  'saving'
                }
                onClick={() =>
                  void recalculateFromLatest()
                }
              >
                <RefreshCw
                  size={14}
                />
                Ricalcola
              </button>
            </div>
          )}

          {setCountChanged && (
            <div className="builder-test-target__warning">
              <TriangleAlert
                size={16}
              />

              <span>
                Hai cambiato il numero
                di serie. Salva di
                nuovo il target per
                aggiornare la
                prescrizione derivata.
              </span>
            </div>
          )}

          {error && (
            <div className="builder-test-target__warning">
              <TriangleAlert
                size={16}
              />

              <span>
                {error}
              </span>
            </div>
          )}

          {message && (
            <p className="builder-test-target__message">
              {message}
            </p>
          )}

          <div className="builder-test-target__actions">
            <button
              type="button"
              className="button button--primary"
              disabled={
                state ===
                  'saving' ||
                !preview.target
              }
              onClick={() =>
                void saveTarget()
              }
            >
              <Save
                size={15}
              />
              {lockedTarget
                ? 'Aggiorna target'
                : 'Usa questo test'}
            </button>

            {lockedTarget && (
              <button
                type="button"
                className="button button--secondary"
                disabled={
                  state ===
                  'saving'
                }
                onClick={() =>
                  void clearTarget()
                }
              >
                <Trash2
                  size={14}
                />
                Rimuovi target
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
