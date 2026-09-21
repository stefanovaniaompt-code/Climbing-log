import type { ExerciseTimerState } from './sessionRunner'

export type TimerAudioCue = 'countdown' | 'work' | 'rest' | 'complete'

export function timerAudioCueForTransition(
  previous: ExerciseTimerState | null,
  current: ExerciseTimerState,
): TimerAudioCue | null {
  if (!current.running && current.phase !== 'complete') return null

  if (
    !previous ||
    previous.exerciseId !== current.exerciseId ||
    previous.phase !== current.phase
  ) {
    if (current.phase === 'complete') return 'complete'
    if (current.phase === 'work') return 'work'
    if (
      current.phase === 'hand_rest' ||
      current.phase === 'interval_rest' ||
      current.phase === 'set_rest'
    ) return 'rest'
  }

  if (
    current.running &&
    current.remaining > 0 &&
    current.remaining <= 3 &&
    previous?.remaining !== current.remaining
  ) return 'countdown'

  return null
}

type Tone = {
  delay: number
  duration: number
  frequency: number
  gain: number
  type: OscillatorType
}

const cueTones: Record<TimerAudioCue, Tone[]> = {
  countdown: [
    { delay: 0, duration: 0.16, frequency: 880, gain: 0.72, type: 'triangle' },
  ],
  work: [
    { delay: 0, duration: 0.18, frequency: 980, gain: 0.82, type: 'triangle' },
    { delay: 0.2, duration: 0.26, frequency: 1320, gain: 0.88, type: 'triangle' },
  ],
  rest: [
    { delay: 0, duration: 0.34, frequency: 430, gain: 0.78, type: 'sine' },
  ],
  complete: [
    { delay: 0, duration: 0.16, frequency: 660, gain: 0.78, type: 'triangle' },
    { delay: 0.18, duration: 0.16, frequency: 880, gain: 0.82, type: 'triangle' },
    { delay: 0.36, duration: 0.32, frequency: 1100, gain: 0.88, type: 'triangle' },
  ],
}

export function playTimerAudioCue(context: AudioContext, cue: TimerAudioCue) {
  const start = context.currentTime + 0.02

  for (const tone of cueTones[cue]) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const toneStart = start + tone.delay
    const toneEnd = toneStart + tone.duration

    oscillator.type = tone.type
    oscillator.frequency.setValueAtTime(tone.frequency, toneStart)
    gain.gain.setValueAtTime(0.0001, toneStart)
    gain.gain.exponentialRampToValueAtTime(tone.gain, toneStart + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(toneStart)
    oscillator.stop(toneEnd + 0.02)
  }
}
