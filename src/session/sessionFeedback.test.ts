import { describe, expect, it } from 'vitest'
import { buildSessionFeedbackUpdate, validateSessionFeedback, type SessionFeedbackInput } from './sessionFeedback'

const athlete: SessionFeedbackInput = { programType: 'athlete', completionOutcome: 'completed', sessionRpe: 7, notes: 'Bene', painPresent: false, painVas: null, painExerciseId: null, painPersistsPostSession: null }
const patientPain: SessionFeedbackInput = { programType: 'patient', completionOutcome: 'not_completed', sessionRpe: 8, notes: 'ignorata', painPresent: true, painVas: 6, painExerciseId: 'exercise-1', painPersistsPostSession: true }

describe('feedback fine sessione', () => {
  it('valida e salva il questionario atleta', () => expect(validateSessionFeedback(athlete, ['exercise-1'])).toMatchObject({ completion_outcome: 'completed', session_rpe: 7, pain_present: false, notes: 'Bene' }))

  it('chiude subito il ramo paziente senza dolore e pulisce i dettagli', () => expect(validateSessionFeedback({ ...patientPain, painPresent: false }, ['exercise-1'])).toEqual({ completion_outcome: 'completed', session_rpe: null, notes: null, pain_present: false, pain_vas: null, pain_exercise_id: null, pain_persists_post_session: null }))

  it('salva i quattro campi obbligatori del ramo paziente con dolore', () => expect(validateSessionFeedback(patientPain, ['exercise-1'])).toMatchObject({ pain_vas: 6, pain_exercise_id: 'exercise-1', pain_persists_post_session: true, completion_outcome: 'not_completed', session_rpe: null }))

  it.each([0, 11, 1.5])('rifiuta VAS %s', painVas => expect(() => validateSessionFeedback({ ...patientPain, painVas }, ['exercise-1'])).toThrow(/VAS/))

  it('rifiuta un esercizio che non appartiene alla sessione', () => expect(() => validateSessionFeedback(patientPain, ['exercise-2'])).toThrow(/questa sessione/))

  it('rende obbligatori i dettagli passando da dolore no a sì', () => expect(() => validateSessionFeedback({ ...patientPain, painVas: null, painExerciseId: null, painPersistsPostSession: null }, ['exercise-1'])).toThrow())

  it('al primo invio imposta submitted e completa la sessione', () => {
    const values = validateSessionFeedback(athlete, [])
    const update = buildSessionFeedbackUpdate(values, { status: 'in_progress', completedAt: null, feedbackSubmittedAt: null }, '2026-09-23T10:00:00Z')
    expect(update).toMatchObject({ status: 'completed', completed_at: '2026-09-23T10:00:00Z', feedback_submitted_at: '2026-09-23T10:00:00Z', feedback_updated_at: null })
  })

  it('in modifica aggiorna solo updated senza cambiare submitted o completed_at', () => {
    const values = validateSessionFeedback(athlete, [])
    const update = buildSessionFeedbackUpdate(values, { status: 'completed', completedAt: '2026-09-22T10:00:00Z', feedbackSubmittedAt: '2026-09-22T10:00:00Z' }, '2026-09-23T10:00:00Z')
    expect(update.feedback_updated_at).toBe('2026-09-23T10:00:00Z')
    expect(update).not.toHaveProperty('feedback_submitted_at')
    expect(update).not.toHaveProperty('completed_at')
    expect(update).not.toHaveProperty('status')
  })
})
