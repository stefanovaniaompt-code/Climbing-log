import { describe, expect, it } from 'vitest'
import type { ExerciseTimerState } from './sessionRunner'
import { timerAudioCueForTransition } from './timerAudio'

const timer = (patch: Partial<ExerciseTimerState> = {}): ExerciseTimerState => ({
  exerciseId: 'exercise-1',
  config: {
    executionMode: 'bilateral', preparationSeconds: 5, workSeconds: 10,
    handChangeSeconds: 0, intervalRestSeconds: 5, repetitions: 2,
    sets: 3, setRestSeconds: 90,
  },
  phase: 'preparation', set: 1, repetition: 1, hand: 'right',
  remaining: 5, running: true, ...patch,
})

describe('timer audio feedback', () => {
  it('annuncia in modo distinto lavoro, recupero e completamento', () => {
    expect(timerAudioCueForTransition(timer(), timer({ phase: 'work', remaining: 10 }))).toBe('work')
    expect(timerAudioCueForTransition(timer({ phase: 'work' }), timer({ phase: 'set_rest', remaining: 90 }))).toBe('rest')
    expect(timerAudioCueForTransition(timer({ phase: 'work' }), timer({ phase: 'complete', remaining: 0, running: false }))).toBe('complete')
  })

  it('annuncia il lavoro quando parte il timer di un altro esercizio', () => {
    expect(timerAudioCueForTransition(
      timer({ exerciseId: 'exercise-1', phase: 'work' }),
      timer({ exerciseId: 'exercise-2', phase: 'work' }),
    )).toBe('work')
  })

  it('suona negli ultimi tre secondi senza ripetere lo stesso secondo', () => {
    expect(timerAudioCueForTransition(timer({ remaining: 4 }), timer({ remaining: 3 }))).toBe('countdown')
    expect(timerAudioCueForTransition(timer({ remaining: 3 }), timer({ remaining: 3 }))).toBeNull()
  })

  it('resta silenzioso quando il timer è in pausa', () => {
    expect(timerAudioCueForTransition(timer({ remaining: 4 }), timer({ remaining: 3, running: false }))).toBeNull()
  })
})
