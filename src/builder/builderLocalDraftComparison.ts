import { readPrescriptionEditorValues, type ProgramBuilderData } from './programBuilder'
import type { StoredBuilderLocalDraft } from './builderLocalDraftStorage'

export type BuilderDraftFieldStatus = 'recoverable' | 'already-synced' | 'conflict'
export type BuilderDraftComparisonStatus = BuilderDraftFieldStatus | 'entity-missing' | 'error'

export type BuilderDraftFieldComparison = {
  field: string
  status: BuilderDraftFieldStatus
  remoteBase: unknown
  localValue: unknown
  remoteCurrent: unknown
}

export type BuilderDraftComparison = {
  draft: StoredBuilderLocalDraft
  status: BuilderDraftComparisonStatus
  programName: string
  entityName: string
  fields: BuilderDraftFieldComparison[]
  error?: string
}

export type BuilderDraftRecoveryPlan = {
  comparison: BuilderDraftComparison
  remoteValues: Record<string, unknown> | null
  mergedValues: Record<string, unknown> | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function builderDraftValuesMatch(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => builderDraftValuesMatch(value, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && builderDraftValuesMatch(left[key], right[key]))
}

function completeBuilderData(value: ProgramBuilderData | null): value is ProgramBuilderData {
  return Boolean(value)
    && Array.isArray(value?.athletes)
    && Array.isArray(value?.programs)
    && Array.isArray(value?.weeks)
    && Array.isArray(value?.sessions)
    && Array.isArray(value?.library)
    && Array.isArray(value?.exercises)
    && Array.isArray(value?.calendarEvents)
}

function exerciseValues(exercise: ProgramBuilderData['exercises'][number]) {
  const prescription = readPrescriptionEditorValues(exercise.prescription)
  return {
    sets: prescription.sets,
    reps: prescription.reps,
    seconds: prescription.seconds,
    loadKg: prescription.loadKg,
    rpe: exercise.targetRpeMax ?? 7,
    restSeconds: exercise.restSeconds ?? 120,
    instructions: exercise.instructions ?? '',
    steps: prescription.steps,
  }
}

function currentEntity(draft: StoredBuilderLocalDraft, data: ProgramBuilderData) {
  if (draft.entityType === 'week') {
    const week = data.weeks.find(item => item.id === draft.entityId && item.programId === draft.programId)
    return week ? {
      name: `Settimana ${week.weekNumber}`,
      values: { blockName: week.blockName ?? '', phase: week.phase ?? '', loadType: week.loadType, notes: week.notes ?? '' },
    } : null
  }
  if (draft.entityType === 'session') {
    const session = data.sessions.find(item => item.id === draft.entityId)
    const week = session ? data.weeks.find(item => item.id === session.weekId && item.programId === draft.programId) : null
    return session && week ? {
      name: session.title || `Seduta ${session.order}`,
      values: { title: session.title, objective: session.objective ?? '', durationMinutes: session.durationMinutes ?? 0, scheduledDay: session.scheduledDay },
    } : null
  }
  const exercise = data.exercises.find(item => item.id === draft.entityId)
  const session = exercise ? data.sessions.find(item => item.id === exercise.sessionId) : null
  const week = session ? data.weeks.find(item => item.id === session.weekId && item.programId === draft.programId) : null
  return exercise && session && week ? { name: exercise.name, values: exerciseValues(exercise) } : null
}

function cloneRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function errorComparison(draft: StoredBuilderLocalDraft, data: ProgramBuilderData | null, error: string): BuilderDraftComparison {
  return {
    draft,
    status: 'error',
    programName: data?.programs?.find(program => program.id === draft.programId)?.name ?? draft.programId,
    entityName: draft.entityId,
    fields: [],
    error,
  }
}

export function compareBuilderLocalDraft(
  draft: StoredBuilderLocalDraft,
  data: ProgramBuilderData | null,
  remoteError?: unknown,
): BuilderDraftComparison {
  const errorMessage = remoteError instanceof Error ? remoteError.message : typeof remoteError === 'string' ? remoteError : ''
  if (errorMessage) return errorComparison(draft, data, errorMessage)
  if (!completeBuilderData(data)) return errorComparison(draft, data, 'Il caricamento remoto è incompleto: la bozza non può essere verificata.')

  const programName = data.programs.find(program => program.id === draft.programId)?.name ?? draft.programId
  const entity = currentEntity(draft, data)
  if (!entity) return { draft, status: 'entity-missing', programName, entityName: draft.entityId, fields: [] }

  const fields = Object.keys(draft.changes)
  if (!fields.length) return errorComparison(draft, data, 'La bozza non contiene campi modificati verificabili.')
  const comparisons: BuilderDraftFieldComparison[] = []
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(draft.remoteBase.fields, field) || !Object.prototype.hasOwnProperty.call(entity.values, field)) {
      return errorComparison(draft, data, `Il campo “${field}” non è disponibile nel confronto remoto.`)
    }
    const remoteBase = draft.remoteBase.fields[field]
    const localValue = draft.changes[field]
    const remoteCurrent = entity.values[field as keyof typeof entity.values]
    const status: BuilderDraftFieldStatus = builderDraftValuesMatch(remoteCurrent, localValue)
      ? 'already-synced'
      : builderDraftValuesMatch(remoteCurrent, remoteBase)
        ? 'recoverable'
        : 'conflict'
    comparisons.push({ field, status, remoteBase, localValue, remoteCurrent })
  }

  const status: BuilderDraftComparisonStatus = comparisons.some(field => field.status === 'conflict')
    ? 'conflict'
    : comparisons.every(field => field.status === 'already-synced')
      ? 'already-synced'
      : 'recoverable'
  return { draft, status, programName, entityName: entity.name, fields: comparisons }
}

export function compareBuilderLocalDrafts(
  drafts: StoredBuilderLocalDraft[],
  data: ProgramBuilderData | null,
  remoteError?: unknown,
) {
  return drafts.map(draft => compareBuilderLocalDraft(draft, data, remoteError))
}

export function planBuilderLocalDraftRecovery(
  draft: StoredBuilderLocalDraft,
  data: ProgramBuilderData | null,
  remoteError?: unknown,
): BuilderDraftRecoveryPlan {
  const comparison = compareBuilderLocalDraft(draft, data, remoteError)
  if (!completeBuilderData(data) || comparison.status === 'entity-missing' || comparison.status === 'error') {
    return { comparison, remoteValues: null, mergedValues: null }
  }
  const entity = currentEntity(draft, data)
  if (!entity) return { comparison, remoteValues: null, mergedValues: null }
  const remoteValues = cloneRecord(entity.values)
  const mergedValues = cloneRecord(entity.values)
  for (const field of comparison.fields) mergedValues[field.field] = JSON.parse(JSON.stringify(field.localValue)) as unknown
  return { comparison, remoteValues, mergedValues }
}
