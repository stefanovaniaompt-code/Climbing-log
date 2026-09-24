import type { ProgramType } from '../programs/programType'

export type CompletionOutcome = 'completed' | 'partial' | 'not_completed'

export type SessionFeedbackInput = {
  programType: ProgramType
  completionOutcome: CompletionOutcome | null
  sessionRpe: number | null
  notes: string
  painPresent: boolean | null
  painVas: number | null
  painExerciseId: string | null
  painPersistsPostSession: boolean | null
}

export type SessionFeedbackValues = {
  completion_outcome: CompletionOutcome
  session_rpe: number | null
  notes: string | null
  pain_present: boolean
  pain_vas: number | null
  pain_exercise_id: string | null
  pain_persists_post_session: boolean | null
}

export function validateSessionFeedback(input: SessionFeedbackInput, sessionExerciseIds: string[]): SessionFeedbackValues {
  if (input.painPresent === null) throw new Error('Indica se hai avuto dolore.')

  if (input.programType === 'athlete') {
    if (input.completionOutcome !== 'completed' && input.completionOutcome !== 'not_completed') throw new Error('Indica se hai completato l’allenamento.')
    if (input.sessionRpe === null || !Number.isFinite(input.sessionRpe) || input.sessionRpe < 0 || input.sessionRpe > 10) throw new Error('L’RPE sessione deve essere compreso tra 0 e 10.')
    return {
      completion_outcome: input.completionOutcome,
      session_rpe: input.sessionRpe,
      notes: input.notes.trim() || null,
      pain_present: input.painPresent,
      pain_vas: null,
      pain_exercise_id: null,
      pain_persists_post_session: null,
    }
  }

  if (!input.painPresent) {
    return {
      completion_outcome: 'completed',
      session_rpe: null,
      notes: null,
      pain_present: false,
      pain_vas: null,
      pain_exercise_id: null,
      pain_persists_post_session: null,
    }
  }

  if (input.painVas === null || !Number.isInteger(input.painVas) || input.painVas < 1 || input.painVas > 10) throw new Error('Il dolore VAS deve essere un numero intero da 1 a 10.')
  if (!input.painExerciseId || !sessionExerciseIds.includes(input.painExerciseId)) throw new Error('Seleziona un esercizio di questa sessione.')
  if (input.painPersistsPostSession === null) throw new Error('Indica se il dolore rimane dopo l’allenamento.')
  if (input.completionOutcome !== 'completed' && input.completionOutcome !== 'not_completed') throw new Error('Indica se hai terminato l’allenamento.')

  return {
    completion_outcome: input.completionOutcome,
    session_rpe: null,
    notes: null,
    pain_present: true,
    pain_vas: input.painVas,
    pain_exercise_id: input.painExerciseId,
    pain_persists_post_session: input.painPersistsPostSession,
  }
}

export function buildSessionFeedbackUpdate(values: SessionFeedbackValues, current: { status: string; completedAt: string | null; feedbackSubmittedAt: string | null }, now: string) {
  return {
    ...values,
    ...(current.status === 'completed' ? {} : { status: 'completed', completed_at: current.completedAt ?? now }),
    ...(current.feedbackSubmittedAt ? { feedback_updated_at: now } : { feedback_submitted_at: now, feedback_updated_at: null }),
    autosaved_at: now,
  }
}
