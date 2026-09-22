import { describe, expect, it } from 'vitest'
import type { TestData } from './testAnalytics'
import {
  buildRetestInput,
  buildTestPresentation,
  canManageTests,
  sessionMeasureCount,
  sessionTindeqTests,
  testCaptureSourceLabel,
} from './testPresentation'

const data: TestData = {
  source: 'demo',
  athletes: [{ id: 'a', name: 'Ada' }],
  sessions: [
    {
      id: 'new',
      athleteId: 'a',
      coachId: 'c',
      testedAt: '2026-09-01',
      createdAt: '2026-09-01T10:00:00Z',
      bodyWeightKg: 60,
      protocolVersion: 'BL-1',
      context: {
        posture: 'seated',
        capture_source: 'manual',
      },
      notes: '',
    },
    {
      id: 'old',
      athleteId: 'a',
      coachId: 'c',
      testedAt: '2026-06-01',
      createdAt: '2026-06-01T10:00:00Z',
      bodyWeightKg: 60,
      protocolVersion: 'BL-1',
      context: { posture: 'seated' },
      notes: '',
    },
  ],
  results: [
    {
      id: '1',
      testSessionId: 'new',
      metricKey: 'peak_force',
      metricLabel: 'Forza picco',
      value: 48,
      unit: 'kg',
      side: 'right',
      grip: '20 mm',
      normalizeToBodyWeight: true,
      setup: { posture: 'seated' },
      notes: '',
    },
    {
      id: '2',
      testSessionId: 'new',
      metricKey: 'peak_force',
      metricLabel: 'Forza picco',
      value: 45,
      unit: 'kg',
      side: 'left',
      grip: '20 mm',
      normalizeToBodyWeight: true,
      setup: { posture: 'seated' },
      notes: '',
    },
    {
      id: '3',
      testSessionId: 'old',
      metricKey: 'peak_force',
      metricLabel: 'Forza picco',
      value: 40,
      unit: 'kg',
      side: 'right',
      grip: '20 mm',
      normalizeToBodyWeight: true,
      setup: { posture: 'seated' },
      notes: '',
    },
    {
      id: '4',
      testSessionId: 'old',
      metricKey: 'peak_force',
      metricLabel: 'Forza picco',
      value: 42,
      unit: 'kg',
      side: 'left',
      grip: '20 mm',
      normalizeToBodyWeight: true,
      setup: { posture: 'seated' },
      notes: '',
    },
  ],
}

describe('test presentation', () => {
  it('unisce destra e sinistra nello stesso gruppo e grafico', () => {
    const presentation = buildTestPresentation(data, 'a')

    expect(presentation.groups).toHaveLength(1)
    expect(presentation.groups[0].right?.latest).toBe(48)
    expect(presentation.groups[0].left?.latest).toBe(45)
    expect(presentation.groups[0].points).toEqual([
      {
        date: '2026-06-01',
        left: 42,
        right: 40,
        bilateral: null,
      },
      {
        date: '2026-09-01',
        left: 45,
        right: 48,
        bilateral: null,
      },
    ])
  })

  it('prepara un retest senza copiare i vecchi valori', () => {
    const retest = buildRetestInput(
      data,
      'new',
      '2026-09-12',
    )

    expect(retest?.protocolVersion).toBe('BL-1')
    expect(retest?.context).toEqual({ posture: 'seated' })
    expect(retest?.metrics).toHaveLength(2)
    expect(
      retest?.metrics.every(metric =>
        Number.isNaN(metric.value),
      ),
    ).toBe(true)
  })

  it('lascia la gestione dei test al coach', () => {
    expect(canManageTests('coach')).toBe(true)
    expect(canManageTests('athlete')).toBe(false)
  })

  it('espone la sorgente di acquisizione', () => {
    expect(testCaptureSourceLabel(data.sessions[0])).toBe(
      'Manuale',
    )
    expect(testCaptureSourceLabel(data.sessions[1])).toBe(
      'Registrato',
    )
  })

  it('nasconde i Newton tecnici del Peak Force live e i metadati interni', () => {
    const liveData: TestData = {
      source: 'legacy-v1',
      athletes: [{ id: 'a', name: 'Ada' }],
      sessions: [{
        id: 'live', athleteId: 'a', coachId: 'c', testedAt: '2026-09-10',
        createdAt: '2026-09-10T10:00:00Z', bodyWeightKg: 60,
        protocolVersion: '2.0', context: {}, notes: '', mode: 'live', status: 'completed',
      }],
      results: [
        {
          id: 'kg', testSessionId: 'live', attemptId: 'attempt-1', metricKey: 'mvc_kg',
          metricLabel: 'MVC', value: 40, unit: 'kg', side: 'right', grip: 'open_hand',
          normalizeToBodyWeight: false, setup: { liveClinicalKind: 'mvc', targetN: 235.3, mvcSourceItemId: 'internal-id' },
          notes: '', protocolKey: 'live_mvc_open_hand', protocolVersion: '2.0',
          measurementSource: 'tindeq', qualityStatus: 'VALID', isPrimary: true,
        },
        {
          id: 'newton', testSessionId: 'live', attemptId: 'attempt-1', metricKey: 'peak_n',
          metricLabel: 'Picco sensore', value: 392.3, unit: 'N', side: 'right', grip: 'open_hand',
          normalizeToBodyWeight: false, setup: { liveClinicalKind: 'mvc', targetN: 235.3, mvcSourceItemId: 'internal-id' },
          notes: '', protocolKey: 'live_mvc_open_hand', protocolVersion: '2.0',
          measurementSource: 'tindeq', qualityStatus: 'VALID', isPrimary: false,
        },
      ],
    }

    const presentation = buildTestPresentation(liveData, 'a')
    expect(presentation.groups).toHaveLength(1)
    expect(presentation.groups[0].unit).toBe('kg')
    expect(presentation.groups[0].setupLabel).toBe('')
    expect(sessionMeasureCount(liveData, 'live')).toBe(1)
    expect(sessionTindeqTests(liveData, 'live')).toEqual([{
      attemptId: 'attempt-1',
      label: 'Peak Force / MVC - Open Hand',
      detail: 'DX - Open Hand - 40 kg',
    }])
  })
})
