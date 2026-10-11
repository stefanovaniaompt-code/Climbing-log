// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import type { ProgramBuilderData } from './programBuilder'
import { compareBuilderLocalDraft, compareBuilderLocalDrafts, planBuilderLocalDraftRecovery } from './builderLocalDraftComparison'
import {
  BUILDER_LOCAL_DRAFT_PREFIX,
  scanBuilderLocalDrafts,
  type BuilderDraftIdentity,
  type StoredBuilderLocalDraft,
} from './builderLocalDraftStorage'

const data: ProgramBuilderData = {
  source: 'legacy-v1',
  athletes: [{ id: 'athlete-1', name: 'Atleta Uno' }],
  programs: [{ id: 'program-1', athleteId: 'athlete-1', name: 'Programma Forza', goal: null, programType: 'athlete', status: 'draft', startDate: null, endDate: null }],
  weeks: [{ id: 'week-1', programId: 'program-1', weekNumber: 1, blockName: 'Blocco', phase: 'Forza', status: 'planned', loadType: 'load', notes: null }],
  sessions: [{ id: 'session-1', weekId: 'week-1', order: 1, title: 'Sessione', objective: 'Base', durationMinutes: 60, scheduledDay: 1 }],
  library: [],
  exercises: [{
    id: 'exercise-1',
    sessionId: 'session-1',
    exerciseId: null,
    order: 1,
    name: 'Hang board',
    prescription: { sets: 3, reps: 5, steps: [{ label: 'Set 1', reps: 5, seconds: 0, loadKg: 20 }] },
    targetRpeMin: 7,
    targetRpeMax: 8,
    restSeconds: 120,
    instructions: 'Base',
  }],
  calendarEvents: [],
}

function draft(
  entityType: BuilderDraftIdentity['entityType'],
  entityId: string,
  baseFields: Record<string, unknown>,
  changes: Record<string, unknown>,
  overrides: Partial<StoredBuilderLocalDraft> = {},
): StoredBuilderLocalDraft {
  return {
    version: 1,
    userId: 'coach-1',
    programId: 'program-1',
    entityType,
    entityId,
    revision: 1,
    updatedAt: '2026-10-11T08:30:00.000Z',
    remoteBase: { fingerprint: 'fnv1a32:test', fields: baseFields },
    changes,
    ...overrides,
  }
}

beforeEach(() => window.localStorage.clear())

describe('confronto a tre versioni delle bozze locali del builder', () => {
  it('classifica come recuperabile una bozza quando il remoto non è cambiato', () => {
    const result = compareBuilderLocalDraft(draft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 }), data)

    expect(result.status).toBe('recoverable')
    expect(result.fields).toEqual([
      expect.objectContaining({ field: 'restSeconds', status: 'recoverable', remoteBase: 120, localValue: 180, remoteCurrent: 120 }),
    ])
  })

  it('classifica come già sincronizzata una modifica già presente sul remoto', () => {
    const remote = { ...data, exercises: [{ ...data.exercises[0], restSeconds: 180 }] }
    const result = compareBuilderLocalDraft(draft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 }), remote)

    expect(result.status).toBe('already-synced')
    expect(result.fields[0]?.status).toBe('already-synced')
  })

  it('classifica come conflitto una modifica concorrente sullo stesso campo', () => {
    const remote = { ...data, exercises: [{ ...data.exercises[0], restSeconds: 150 }] }
    const result = compareBuilderLocalDraft(draft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 }), remote)

    expect(result.status).toBe('conflict')
    expect(result.fields[0]?.remoteCurrent).toBe(150)
  })

  it('confronta strutturalmente i JSON e ignora modifiche remote a campi non toccati', () => {
    const localSteps = [{ loadKg: 20, seconds: 0, reps: 6, label: 'Set 1' }]
    const remote = {
      ...data,
      exercises: [{
        ...data.exercises[0],
        instructions: 'Modifica remota indipendente',
        prescription: { sets: 3, reps: 6, steps: [{ label: 'Set 1', reps: 6, seconds: 0, loadKg: 20 }] },
      }],
    }
    const result = compareBuilderLocalDraft(draft(
      'exercise',
      'exercise-1',
      { steps: [{ reps: 5, label: 'Set 1', loadKg: 20, seconds: 0 }] },
      { steps: localSteps },
    ), remote)

    expect(result.status).toBe('already-synced')
    expect(result.fields).toHaveLength(1)
  })

  it('classifica insieme bozze di settimana, seduta ed esercizio', () => {
    const results = compareBuilderLocalDrafts([
      draft('week', 'week-1', { notes: '' }, { notes: 'Nota locale' }),
      draft('session', 'session-1', { objective: 'Base' }, { objective: 'Obiettivo locale' }),
      draft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 }),
    ], data)

    expect(results.map(result => [result.draft.entityType, result.status])).toEqual([
      ['week', 'recoverable'],
      ['session', 'recoverable'],
      ['exercise', 'recoverable'],
    ])
    expect(results.every(result => result.programName === 'Programma Forza')).toBe(true)
  })

  it('segnala esplicitamente entità mancanti e caricamenti remoti falliti o incompleti', () => {
    const missing = compareBuilderLocalDraft(draft('exercise', 'exercise-deleted', { restSeconds: 120 }, { restSeconds: 180 }), data)
    const failed = compareBuilderLocalDrafts([draft('week', 'week-1', { notes: '' }, { notes: 'Locale' })], null, new Error('rete assente'))
    const incomplete = compareBuilderLocalDrafts(
      [draft('week', 'week-1', { notes: '' }, { notes: 'Locale' })],
      { ...data, sessions: undefined } as unknown as ProgramBuilderData,
    )

    expect(missing.status).toBe('entity-missing')
    expect(failed[0]).toMatchObject({ status: 'error', error: 'rete assente' })
    expect(incomplete[0]).toMatchObject({ status: 'error' })
  })

  it('ricostruisce il valore locale sulla versione remota più recente senza perdere campi indipendenti', () => {
    const remote = {
      ...data,
      exercises: [{ ...data.exercises[0], instructions: 'Aggiornata online' }],
    }
    const result = planBuilderLocalDraftRecovery(
      draft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 }),
      remote,
    )

    expect(result.comparison.status).toBe('recoverable')
    expect(result.remoteValues).toMatchObject({ restSeconds: 120, instructions: 'Aggiornata online' })
    expect(result.mergedValues).toMatchObject({ restSeconds: 180, instructions: 'Aggiornata online' })
  })

  it('ricostruisce una bozza parzialmente sincronizzata senza ripetere campi già presenti online', () => {
    const remote = {
      ...data,
      exercises: [{ ...data.exercises[0], restSeconds: 180 }],
    }
    const result = planBuilderLocalDraftRecovery(
      draft(
        'exercise',
        'exercise-1',
        { restSeconds: 120, instructions: 'Base' },
        { restSeconds: 180, instructions: 'Locale' },
      ),
      remote,
    )

    expect(result.comparison.fields.map(field => [field.field, field.status])).toEqual([
      ['restSeconds', 'already-synced'],
      ['instructions', 'recoverable'],
    ])
    expect(result.mergedValues).toMatchObject({ restSeconds: 180, instructions: 'Locale' })
  })
})

describe('scansione sicura delle bozze locali', () => {
  it('isola gli utenti e segnala JSON corrotto o versioni incompatibili senza cancellarli', () => {
    const currentCorruptKey = `${BUILDER_LOCAL_DRAFT_PREFIX}:coach-1:program-1:exercise:exercise-corrupt`
    const currentVersionKey = `${BUILDER_LOCAL_DRAFT_PREFIX}:coach-1:program-1:week:week-old`
    const otherUserKey = `${BUILDER_LOCAL_DRAFT_PREFIX}:coach-2:program-1:exercise:exercise-other`
    window.localStorage.setItem(currentCorruptKey, '{non-json')
    window.localStorage.setItem(currentVersionKey, JSON.stringify({ ...draft('week', 'week-old', { notes: '' }, { notes: 'Locale' }), version: 99 }))
    window.localStorage.setItem(otherUserKey, JSON.stringify(draft('exercise', 'exercise-other', { restSeconds: 120 }, { restSeconds: 180 }, { userId: 'coach-2' })))

    const result = scanBuilderLocalDrafts('coach-1')

    expect(result.drafts).toEqual([])
    expect(result.issues.map(issue => issue.code)).toEqual(['corrupt', 'incompatible-version'])
    expect(window.localStorage.getItem(currentCorruptKey)).toBe('{non-json')
    expect(window.localStorage.getItem(currentVersionKey)).not.toBeNull()
    expect(result.issues.every(issue => issue.identity?.userId === 'coach-1')).toBe(true)
  })
})
