import { useState, type Dispatch, type SetStateAction } from 'react'
import type { AppProfile } from '../onboarding/types'
import { beginSession, saveExerciseProgress } from './sessionRunnerRepository'
import type { ExerciseTimerState, SessionRunnerData } from './sessionRunner'
import type { ExerciseInputDraft } from './sessionLocalDraft'

export type ExerciseSaveState = 'idle' | 'saving' | 'saved' | 'queued' | 'error'

type Props = {
  profile: AppProfile
  runner: SessionRunnerData | null | undefined
  setRunner: Dispatch<SetStateAction<SessionRunnerData | null | undefined>>
  timerState: ExerciseTimerState | null
  setTimerState: Dispatch<SetStateAction<ExerciseTimerState | null>>
  setError: Dispatch<SetStateAction<string>>
}

export function useExerciseProgress({ profile, runner, setRunner, timerState, setTimerState, setError }: Props) {
  const [exerciseInputs, setExerciseInputs] = useState<Record<string, ExerciseInputDraft>>({})
  const [exerciseSaveStates, setExerciseSaveStates] = useState<Record<string, ExerciseSaveState>>({})

const updateExerciseInput = (
  exerciseId: string,
  patch: Partial<ExerciseInputDraft>,
) => {
  setExerciseInputs(current => ({
    ...current,
    [exerciseId]: {
      rpe: current[exerciseId]?.rpe ?? '',
      notes: current[exerciseId]?.notes ?? '',
      ...patch,
    },
  }))

  setExerciseSaveStates(current => ({
    ...current,
    [exerciseId]: 'idle',
  }))
}

const recordExercise = async (
  exercise: SessionRunnerData['exercises'][number],
) => {
  if (!runner || exercise.progress?.completed) return

  const input =
    exerciseInputs[exercise.id] ?? {
      rpe: '',
      notes: '',
    }

  const parsedRpe =
    input.rpe.trim()
      ? Number(input.rpe)
      : null

  if (
    parsedRpe !== null &&
    (
      !Number.isFinite(parsedRpe) ||
      parsedRpe < 0 ||
      parsedRpe > 10
    )
  ) {
    setExerciseSaveStates(current => ({
      ...current,
      [exercise.id]: 'error',
    }))

    setError(
      "L'RPE dell'esercizio deve essere compreso tra 0 e 10.",
    )
    return
  }

  setExerciseSaveStates(current => ({
    ...current,
    [exercise.id]: 'saving',
  }))
  setError('')

  try {
    let logId = runner.session.logId
    let startedAt = runner.session.startedAt

    if (!logId) {
      const log = await beginSession(
        profile,
        runner.session.id,
      )

      logId = log.id
      startedAt = log.started_at
    }

    const result = await saveExerciseProgress(
      profile,
      logId,
      exercise,
      {
        rpe: parsedRpe,
        notes: input.notes,
      },
    )

    setRunner(current => {
      if (!current) return current

      return {
        ...current,
        session: {
          ...current.session,
          logId,
          status: 'in_progress',
          startedAt:
            current.session.startedAt ??
            startedAt,
        },
        exercises: current.exercises.map(item =>
          item.id === exercise.id
            ? {
                ...item,
                progress: result.progress,
              }
            : item,
        ),
      }
    })

    if (
      timerState?.exerciseId ===
      exercise.id
    ) {
      setTimerState(null)
    }

    setExerciseSaveStates(current => ({
      ...current,
      [exercise.id]:
        result.disposition === 'queued'
          ? 'queued'
          : 'saved',
    }))
  } catch (reason) {
    setExerciseSaveStates(current => ({
      ...current,
      [exercise.id]: 'error',
    }))

    setError(
      reason instanceof Error
        ? reason.message
        : 'Esercizio non registrato.',
    )
  }
}


  return { exerciseInputs, setExerciseInputs, exerciseSaveStates, setExerciseSaveStates, updateExerciseInput, recordExercise }
}

