import { describe, expect, it } from 'vitest'
import { mergePrescriptionForUpdate } from '../builder/programBuilder'
import {
  buildTimerSeriesSequence,
  formatTimerPreview,
  readTimerSettings,
  timerSettingsFromPrescription,
  type TimerEditorValues,
  type TimerSettings,
} from './timerConfiguration'

const base: TimerEditorValues = {
  mode: 'guided', executionMode: 'alternate_hands', sets: 3, reps: 6, seconds: 7, restSeconds: 90,
  preparationSeconds: 5, handChangeSeconds: 3, intervalRestSeconds: 0,
}
const baseSettings: TimerSettings = {
  mode: base.mode, executionMode: base.executionMode, preparationSeconds: base.preparationSeconds,
  handChangeSeconds: base.handChangeSeconds, intervalRestSeconds: base.intervalRestSeconds,
}

describe('timer configuration', () => {
  it('non converte automaticamente le vecchie prescrizioni a tempo in timer guidati', () => {
    expect(readTimerSettings({ seconds: 7 })).toMatchObject({ mode: 'none', executionMode: 'bilateral' })
  })

  it('riconosce il recupero legacy per il Builder quando è prescritto e rispetta un recupero canonico zero', () => {
    expect(readTimerSettings({ sets: 3, timer: { set_rest_seconds: 60 } }).mode).toBe('recovery_only')
    expect(readTimerSettings({ sets: 3, timer: { set_rest_seconds: 60 } }, 0).mode).toBe('none')
  })

  it('mantiene guided e alternanza legacy single_hand, senza duplicare serie/ripetizioni/durata', () => {
    const prescription = { sets: 3, reps: 6, seconds: 7, timer: { work_seconds: 7, repetitions: 6, execution_mode: 'single_hand', vendor_extension: 'keep' } }
    expect(timerSettingsFromPrescription(prescription, 90)).toMatchObject({ mode: 'guided', executionMode: 'alternate_hands', sets: 3, reps: 6, seconds: 7 })

    const saved = mergePrescriptionForUpdate(prescription, {
      sets: 3, reps: 6, seconds: 7, loadKg: 0, steps: [], restSeconds: 90,
      timerSettings: { ...baseSettings, preparationSeconds: 8 },
    })
    expect(saved).toMatchObject({ sets: 3, reps: 6, seconds: 7, timer: { work_seconds: 7, repetitions: 6, execution_mode: 'single_hand', preparation_seconds: 8, vendor_extension: 'keep' } })
  })

  it('salva la modalità timer preservando proprietà sconosciute senza creare repliche indipendenti', () => {
    const current = { sets: 2, reps: 4, seconds: 5, custom_prescription_field: { keep: true }, timer: { external_setting: 'preserve' } }
    const saved = mergePrescriptionForUpdate(current, {
      sets: 3, reps: 6, seconds: 7, loadKg: 0, steps: [], restSeconds: 120,
      timerSettings: baseSettings,
    })
    expect(saved).toMatchObject({ sets: 3, reps: 6, seconds: 7, custom_prescription_field: { keep: true }, timer: { external_setting: 'preserve', mode: 'guided', execution_mode: 'single_hand' } })
    expect(saved.timer).not.toHaveProperty('sets')
    expect(saved.timer).not.toHaveProperty('repetitions')
    expect(saved.timer).not.toHaveProperty('work_seconds')
  })

  it('genera la sequenza DX/SX alternata per ogni ripetizione per mano e senza pause finali superflue', () => {
    const sequence = buildTimerSeriesSequence(base)
    expect(sequence.slice(0, 7).map(step => step.label)).toEqual([
      'preparazione 5s', 'DX1 7s', 'cambio 3s', 'SX1 7s', 'cambio 3s', 'DX2 7s', 'cambio 3s',
    ])
    expect(sequence.filter(step => step.kind === 'work' && step.hand === 'DX')).toHaveLength(6)
    expect(sequence.filter(step => step.kind === 'work' && step.hand === 'SX')).toHaveLength(6)
    expect(sequence.at(-1)).toMatchObject({ kind: 'work', hand: 'SX', repetition: 6 })
    expect(sequence.at(-1)?.kind).not.toBe('hand_change')
    expect(formatTimerPreview(base)).toContain('18 DX + 18 SX')
    expect(formatTimerPreview(base)).toContain('recupero 90s')
  })

  it('distingue esecuzione bilaterale e lavoro limitato a una sola mano', () => {
    expect(buildTimerSeriesSequence({ ...base, executionMode: 'bilateral', reps: 2 }).filter(step => step.kind === 'work').map(step => step.label)).toEqual(['ripetizione 1 7s', 'ripetizione 2 7s'])
    expect(buildTimerSeriesSequence({ ...base, executionMode: 'right_only', reps: 2 }).filter(step => step.kind === 'work').map(step => step.label)).toEqual(['DX1 7s', 'DX2 7s'])
    expect(buildTimerSeriesSequence({ ...base, executionMode: 'left_only', reps: 2 }).filter(step => step.kind === 'work').map(step => step.label)).toEqual(['SX1 7s', 'SX2 7s'])
  })

  it('descrive modalità recupero e nessun timer senza inventare prescrizioni', () => {
    expect(formatTimerPreview({ ...base, mode: 'recovery_only' })).toContain('lavoro libero; conferma serie e recupero avviato dall’atleta')
    expect(formatTimerPreview({ ...base, mode: 'none' })).toBe('Nessun timer: esecuzione libera.')
    expect(buildTimerSeriesSequence({ ...base, mode: 'none' })).toEqual([])
  })

  it('non mostra una sequenza attiva quando guidato o solo recupero non sono ricostruibili', () => {
    expect(formatTimerPreview({ ...base, mode: 'guided', reps: 0, seconds: 0 })).toContain('Timer non avviabile')
    expect(formatTimerPreview({ ...base, mode: 'recovery_only', restSeconds: null })).toContain('specificare il recupero')
  })

  it('mantiene la preview coerente con le ripetizioni variabili di ogni serie', () => {
    const values = { ...base, executionMode: 'alternate_hands' as const, series: [
      { reps: 10, seconds: 7 }, { reps: 8, seconds: 6 }, { reps: 6, seconds: 5 },
    ] }
    const secondSeries = buildTimerSeriesSequence(values, 2).filter(step => step.kind === 'work').map(step => step.label)
    expect(secondSeries).toHaveLength(16)
    expect(secondSeries.slice(0, 4)).toEqual(['DX1 6s', 'SX1 6s', 'DX2 6s', 'SX2 6s'])
    expect(secondSeries.slice(-2)).toEqual(['DX8 6s', 'SX8 6s'])
    expect(formatTimerPreview(values)).toContain('24 per mano (24 DX + 24 SX)')
  })
})
