import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { advanceExerciseTimer, confirmExerciseTimerSet, createExerciseTimerState, elapseExerciseTimer, toggleExerciseTimerState, type ExerciseTimerState, type SessionRunnerData } from './sessionRunner'
import { playTimerAudioCue, timerAudioCueForTransition } from './timerAudio'

type SessionExercise = SessionRunnerData['exercises'][number]

type SessionTimerController = {
  timerState: ExerciseTimerState | null
  setTimerState: Dispatch<SetStateAction<ExerciseTimerState | null>>
  soundEnabled: boolean
  toggleSound: () => void
  toggleTimer: (exercise: SessionExercise) => void
  confirmSet: (exerciseId: string) => void
  resetTimer: (exercise: SessionExercise) => void
  adjustTimer: (exerciseId: string, seconds: number) => void
  skipTimerPhase: (exerciseId: string) => void
}

export function useSessionTimer(): SessionTimerController {
  const [timerState, updateTimerState] = useState<ExerciseTimerState | null>(null)
  const lastTickAtRef = useRef<number | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioArmedRef = useRef(false)
  const previousTimerStateRef = useRef<ExerciseTimerState | null>(null)

const setTimerState = useCallback<Dispatch<SetStateAction<ExerciseTimerState | null>>>(action => {
  lastTickAtRef.current = Date.now()
  updateTimerState(action)
}, [])

const reconcileTimer = useCallback(() => {
  const now = Date.now()
  const previous = lastTickAtRef.current
  if (previous === null) return
  const elapsed = Math.max(0, Math.floor((now - previous) / 1000))
  if (elapsed < 1) return
  lastTickAtRef.current = previous + elapsed * 1000
  updateTimerState(value => value ? elapseExerciseTimer(value, elapsed) : null)
}, [])

useEffect(() => {
  if (!timerState?.running || timerState.phase === 'complete') {
    lastTickAtRef.current = null
    return
  }
  if (lastTickAtRef.current === null) lastTickAtRef.current = Date.now()
  const interval = window.setInterval(reconcileTimer, 1000)
  return () => window.clearInterval(interval)
}, [timerState?.running, timerState?.phase, reconcileTimer])

useEffect(() => {
  const reconcileOnReturn = () => {
    if (document.visibilityState !== 'hidden') reconcileTimer()
  }
  document.addEventListener('visibilitychange', reconcileOnReturn)
  window.addEventListener('focus', reconcileOnReturn)
  return () => {
    document.removeEventListener('visibilitychange', reconcileOnReturn)
    window.removeEventListener('focus', reconcileOnReturn)
  }
}, [reconcileTimer])

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
  reconcileTimer()
  setTimerState(current => toggleExerciseTimerState(exercise, current))
}

const confirmSet = (exerciseId: string) => {
  setTimerState(current => current?.exerciseId === exerciseId ? confirmExerciseTimerSet(current) : current)
}

const resetTimer = (exercise: SessionRunnerData['exercises'][number]) => {
  setTimerState(createExerciseTimerState(exercise))
}

const adjustTimer = (exerciseId: string, seconds: number) => {
  reconcileTimer()
  setTimerState(current => current?.exerciseId === exerciseId && current.phase !== 'complete' && current.phase !== 'awaiting_set'
    ? { ...current, remaining: Math.max(1, current.remaining + seconds) }
    : current)
}

const skipTimerPhase = (exerciseId: string) => {
  reconcileTimer()
  setTimerState(current => current?.exerciseId === exerciseId
    ? advanceExerciseTimer(current)
    : current)
}

  return { timerState, setTimerState, soundEnabled, toggleSound, toggleTimer, confirmSet, resetTimer, adjustTimer, skipTimerPhase }
}
