import { describe, expect, it } from 'vitest'
import type { TestData } from './testAnalytics'
import {
  buildRetestInput,
  buildTestPresentation,
  canManageTests,
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
})
