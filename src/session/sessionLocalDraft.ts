import type { CompletionOutcome } from './sessionFeedback'
import type { ExerciseTimerSnapshot } from './sessionRunner'

export type ExerciseInputDraft = {
  rpe: string
  notes: string
}

type SessionLocalDraft = {
  version: 1
  sessionId: string
  outcome: CompletionOutcome | null
  sessionRpe: string
  sessionNote: string
  painPresent: boolean | null
  painVas: string
  painExerciseId: string
  painPersistsPostSession: boolean | null
  timer: ExerciseTimerSnapshot | null
  exerciseInputs: Record<string, ExerciseInputDraft>
}

function readExerciseInputDrafts(
  value: unknown,
): Record<string, ExerciseInputDraft> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {}
  }

  const result: Record<string, ExerciseInputDraft> = {}

  for (const [exerciseId, raw] of Object.entries(value)) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw)
    ) {
      continue
    }

    const entry = raw as Record<string, unknown>

    result[exerciseId] = {
      rpe:
        typeof entry.rpe === 'string'
          ? entry.rpe
          : '',
      notes:
        typeof entry.notes === 'string'
          ? entry.notes
          : '',
    }
  }

  return result
}

export function readSessionLocalDraft(
  key: string,
): SessionLocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<SessionLocalDraft>

    if (
      parsed.version !== 1 ||
      typeof parsed.sessionId !== 'string'
    ) {
      return null
    }

    const timerCandidate =
      parsed.timer &&
      typeof parsed.timer === 'object' &&
      typeof parsed.timer.savedAt === 'number' &&
      parsed.timer.state &&
      typeof parsed.timer.state.exerciseId === 'string'
        ? parsed.timer as ExerciseTimerSnapshot
        : null

    return {
      version: 1,
      sessionId: parsed.sessionId,
      outcome:
        parsed.outcome === 'completed' ||
        parsed.outcome === 'partial' ||
        parsed.outcome === 'not_completed'
          ? parsed.outcome
          : null,
      sessionRpe:
        typeof parsed.sessionRpe === 'string'
          ? parsed.sessionRpe
          : '',
      sessionNote:
        typeof parsed.sessionNote === 'string'
          ? parsed.sessionNote
          : '',
      painPresent: typeof parsed.painPresent === 'boolean' ? parsed.painPresent : null,
      painVas: typeof parsed.painVas === 'string' ? parsed.painVas : '',
      painExerciseId: typeof parsed.painExerciseId === 'string' ? parsed.painExerciseId : '',
      painPersistsPostSession: typeof parsed.painPersistsPostSession === 'boolean' ? parsed.painPersistsPostSession : null,
      timer: timerCandidate,
      exerciseInputs:
        readExerciseInputDrafts(
          parsed.exerciseInputs,
        ),
    }
  } catch {
    return null
  }
}

export function writeSessionLocalDraft(
  key: string,
  draft: SessionLocalDraft,
) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(draft),
    )
  } catch {
    // Local storage can be unavailable.
  }
}

export function clearSessionLocalDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Local storage can be unavailable.
  }
}

