import { describe, expect, it } from 'vitest'
import { getExerciseTimerConfig, createExerciseTimerState, type RunnerExercise } from '../session/sessionRunner'
import { resolveExerciseTimerValues, buildTimerProtocolSequence } from './timerConfiguration'

function exercise(name: string, prescription: Record<string, unknown>, restSeconds: number | null = null, instructions: string | null = null): RunnerExercise {
  return { id: 'example', order: 1, name, prescription, restSeconds, instructions, calculationContext: {}, targetRpeMin: null, targetRpeMax: null, progress: null }
}

describe('compatibilità timer delle sessioni storiche', () => {
  it('ricostruisce in sola lettura le cinque serie storiche complete di Intentional Block Lifting', () => {
    const prescription = { sets: 1, reps: 0 }
    const item = exercise('Intentional Block Lifting', prescription, 120,
      'Massimale di 27 kg\n10 rep 60%\n8 rep 65%\n6 rep 70%\n4 rep 80%\n3 rep 86%')
    expect(getExerciseTimerConfig(item)?.sets).toBe(5)
    expect(getExerciseTimerConfig(item)?.series?.map(row => row.reps)).toEqual([10, 8, 6, 4, 3])
    expect(createExerciseTimerState(item)?.sequence.filter(step => step.kind === 'set_rest')).toHaveLength(4)
    expect(prescription).toEqual({ sets: 1, reps: 0 })
  })

  it('mantiene cinque serie e ripetizioni variabili nel timer di Intentional Block Lifting', () => {
    const item = exercise('Intentional Block Lifting', {
      sets: 5,
      reps: 0,
      intentionalLoad: { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: 27 } },
      steps: [10, 8, 6, 4, 3].map((reps, index) => ({ reps, percentage: [60, 65, 70, 80, 86][index], seconds: 0 })),
    }, 120)
    const config = getExerciseTimerConfig(item)
    expect(config).toMatchObject({ mode: 'recovery_only', sets: 5, setRestSeconds: 120 })
    expect(config?.series?.map(row => row.reps)).toEqual([10, 8, 6, 4, 3])
    expect(createExerciseTimerState(item)?.sequence.filter(step => step.kind === 'set_rest')).toHaveLength(4)
  })

  it('guida Open Hand alternando DX e SX e conserva serie, durata e recupero della sessione', () => {
    const item = exercise('Open Hand iso Grip', { sets: 5, reps: 1, seconds: 14, timer: { execution_mode: 'single_hand', work_seconds: 10, repetitions: 1, set_rest_seconds: 120 } })
    const config = getExerciseTimerConfig(item)
    expect(config).toMatchObject({ mode: 'guided', sets: 5, workSeconds: 14, repetitions: 1, executionMode: 'alternate_hands', handChangeSeconds: 10, setRestSeconds: 120 })
    expect(createExerciseTimerState(item)?.sequence.map(step => step.kind).slice(0, 4)).toEqual(['work', 'hand_change', 'work', 'set_rest'])
  })

  it('guida blocchi 90°, Half Crimp, Plank e Campus 20s senza recuperi finali', () => {
    for (const item of [
      exercise('Bloccaggi 5" a 90° su manopole', { sets: 4, reps: 6, seconds: 5 }, 60),
      exercise('Half Crimp Iso Grip al Trave', { sets: 4, reps: 4, seconds: 6 }, 60),
      exercise('Plank', { sets: 1, reps: 4, seconds: 45 }, 60),
      exercise('Campus Board / Power Progression', { sets: 4, seconds: 20 }, 90),
    ]) {
      const config = getExerciseTimerConfig(item)
      expect(config?.mode).toBe('guided')
      const sequence = createExerciseTimerState(item)?.sequence ?? []
      expect(sequence.at(-1)?.kind).toBe('work')
      if (item.name === 'Plank') expect(sequence.filter(step => step.kind === 'interval_rest')).toHaveLength(3)
      if (item.name.includes('90°') || item.name.includes('Crimp')) expect(sequence.some(step => step.kind === 'interval_rest' && step.durationSeconds === 5)).toBe(true)
    }
  })

  it('usa due fasi consecutive e un segnale di transizione per 90° + 120°', () => {
    const item = exercise('Bloccaggio a 90°i 3" poi a 120° per 3" consecutivi', { sets: 4, reps: 4 }, 120)
    const sequence = createExerciseTimerState(item)?.sequence ?? []
    expect(sequence.slice(0, 4).map(step => [step.kind, step.durationSeconds])).toEqual([['work', 3], ['work', 3], ['interval_rest', 5], ['work', 3]])
    expect(sequence[0].label).toContain('90°')
    expect(sequence[1].label).toContain('120°')
  })

  it('distingue Campus a ripetizioni, recupero autoregolato, Wall Crawl e scalata libera', () => {
    expect(getExerciseTimerConfig(exercise('Campus Board / Power Progression', { sets: 4, dose: '4 ripetizioni (2 per braccio)' }, 90))?.mode).toBe('recovery_only')
    expect(getExerciseTimerConfig(exercise('Anaerobic Capacity', { sets: 4 }, null, 'Recupero autoregolato'))).toBeNull()
    expect(getExerciseTimerConfig(exercise('Wall Crawl', { sets: 4 }, 120))).toBeNull()
    expect(getExerciseTimerConfig(exercise('Scalata libera in falesia', { sets: 3 }, 120))).toBeNull()
  })

  it('applica solo recupero a forza, Piramidale e intervallo 2–3 minuti senza riscrivere i dati', () => {
    const panca = exercise('Panca piana', { sets: 4, reps: 5 })
    expect(getExerciseTimerConfig(panca)).toMatchObject({ mode: 'recovery_only', setRestSeconds: 60 })
    expect(panca.prescription).toEqual({ sets: 4, reps: 5 })
    const pyramid = exercise('Piramidale di forza', { dose: '4-2-1-1-2-4 blocchi' }, 240)
    expect(getExerciseTimerConfig(pyramid)).toMatchObject({ sets: 6, setRestSeconds: 240 })
    expect(createExerciseTimerState(pyramid)?.sequence.filter(step => step.kind === 'set_rest')).toHaveLength(5)
    const lifting = exercise('Intentional Block Lifting', { sets: 5 }, null, 'Recupero 2–3 minuti.')
    expect(getExerciseTimerConfig(lifting)).toMatchObject({ setRestSeconds: 120, maxSetRestSeconds: 180 })
  })

  it('rispetta la modalità esplicita e rende coerente la preview condivisa', () => {
    const values = resolveExerciseTimerValues('Wall Crawl', { sets: 4, reps: 2, timer: { mode: 'guided' } }, 120)
    expect(values.mode).toBe('guided')
    expect(buildTimerProtocolSequence(resolveExerciseTimerValues('Plank', { sets: 1, reps: 3, seconds: 45 }, 45)).filter(step => step.kind === 'interval_rest')).toHaveLength(2)
  })
})
