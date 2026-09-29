import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { advanceExerciseTimer, createExerciseTimerState, restartExerciseTimerState, tickExerciseTimer, type ExerciseTimerState, type SessionRunnerData } from './sessionRunner'
import { playTimerAudioCue, timerAudioCueForTransition } from './timerAudio'

type SessionExercise = SessionRunnerData['exercises'][number]

type SessionTimerController = {
  timerState: ExerciseTimerState | null
  setTimerState: Dispatch<SetStateAction<ExerciseTimerState | null>>
  soundEnabled: boolean
  toggleSound: () => void
  toggleTimer: (exercise: SessionExercise) => void
  resetTimer: (exercise: SessionExercise) => void
  adjustTimer: (exerciseId: string, seconds: number) => void
  skipTimerPhase: (exerciseId: string) => void
}

export function useSessionTimer(): SessionTimerController {
  const [timerState, setTimerState] = useState<ExerciseTimerState | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioArmedRef = useRef(false)
  const previousTimerStateRef = useRef<ExerciseTimerState | null>(null)

useEffect(() => {
  if (!timerState?.running || timerState.phase === 'complete') return
  const interval = window.setInterval(() => setTimerState(value => value ? tickExerciseTimer(value) : null), 1000)
  return () => window.clearInterval(interval)
}, [timerState?.running, timerState?.phase])

useEffect(() => {
  const previous = previousTimerStateRef.current
  previousTimerStateRef.current = timerState

  if (
    !timerState ||
    !soundEnabled ||
    !audioArmedRef.current ||
    !audioContextRef.current
  ) return

  const cue = timerAudioCueForTransition(previous, timerState)
  if (!cue) return

  playTimerAudioCue(audioContextRef.current, cue)

  if ('vibrate' in navigator && cue !== 'countdown') {
    navigator.vibrate(cue === 'complete' ? [90, 70, 140] : 90)
  }
}, [soundEnabled, timerState])

useEffect(() => () => {
  void audioContextRef.current?.close()
}, [])


const armAudioFeedback = () => {
  if (!soundEnabled) return

  audioArmedRef.current = true
  const context = audioContextRef.current ?? new AudioContext()
  audioContextRef.current = context

  if (context.state === 'suspended') void context.resume()
}

const toggleSound = () => {
  if (soundEnabled) {
    setSoundEnabled(false)
    return
  }

  setSoundEnabled(true)
  audioArmedRef.current = true
  const context = audioContextRef.current ?? new AudioContext()
  audioContextRef.current = context
  void context.resume().then(() => playTimerAudioCue(context, 'countdown'))
}

const toggleTimer = (exercise: SessionRunnerData['exercises'][number]) => {
  armAudioFeedback()
  setTimerState(current => {
    if (current?.exerciseId === exercise.id) {
      if (current.phase === 'complete') {
        const restarted = restartExerciseTimerState(
          exercise,
          current,
        )
        return restarted ? { ...restarted, running: true } : null
      }
      return { ...current, running: !current.running }
    }
    const created = createExerciseTimerState(exercise)
    return created ? { ...created, running: true } : null
  })
}

const resetTimer = (exercise: SessionRunnerData['exercises'][number]) => {
  setTimerState(createExerciseTimerState(exercise))
}

const adjustTimer = (exerciseId: string, seconds: number) => {
  setTimerState(current => current?.exerciseId === exerciseId && current.phase !== 'complete'
    ? { ...current, remaining: Math.max(1, current.remaining + seconds) }
    : current)
}

const skipTimerPhase = (exerciseId: string) => {
  setTimerState(current => current?.exerciseId === exerciseId
    ? advanceExerciseTimer(current)
    : current)
}

  return { timerState, setTimerState, soundEnabled, toggleSound, toggleTimer, resetTimer, adjustTimer, skipTimerPhase }
}
