import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  AcquisitionResult,
} from '../tindeq/acquisition'

import {
  buildCanonicalTestResults,
  primaryCanonicalMetric,
} from './testCanonicalResults'

import type {
  TestSessionDraft,
  TestSessionItemDraft,
} from './testAttemptTypes'

const session:
  TestSessionDraft = {
    id: 'session-1',
    athleteId: 'athlete-1',
    coachId: 'coach-1',
    mode: 'live',
    status: 'in_progress',
    testedAt: '2026-09-12',
    bodyWeightKg: 60,
    protocolVersion: '1.0',
    context: {},
    startedAt:
      '2026-09-12T08:00:00.000Z',
    endedAt: null,
  }

function item(
  patch:
    Partial<TestSessionItemDraft> = {},
): TestSessionItemDraft {
  return {
    id: 'item-1',
    testSessionId:
      'session-1',
    itemOrder: 1,
    protocolKey:
      'peak_force',
    protocolVersion:
      '1.0',
    side: 'right',
    grip: '20 mm',
    source: 'tindeq',
    config: {
      edgeMm: 20,
      posture: 'seated',
    },
    status: 'in_progress',
    ...patch,
  }
}

function acquisition(
  patch:
    Partial<AcquisitionResult> = {},
): AcquisitionResult {
  return {
    samples:
      Object.freeze([]),

    startedAt:
      '2026-09-12T08:00:00.000Z',

    endedAt:
      '2026-09-12T08:00:05.000Z',

    deviceInfo: null,

    qualityStatus:
      'VALID',

    qualityFlags: [],

    primaryMetricKey:
      'peak_nkg',

    primaryValue:
      8,

    primaryUnit:
      'N/kg',

    secondaryMetrics: {
      peak_n:
        480,

      peak_kgf:
        48.946,

      peak_nkg:
        8,

      peak_percent_bw:
        81.577,

      rfd_50:
        900,

      rfd_100:
        1100,

      rfd_150:
        1200,

      rfd_200:
        1250,

      rfd_250:
        1200,

      time_to_peak:
        430,

      mean_force:
        300,

      impulse:
        1450,

      duration:
        5,

      fatigue_slope:
        -2,
    },

    samplingMetadata: {
      sampleCount: 500,
      durationSeconds: 5,
      estimatedHz: 100,
      maximumGapMs: 11,
    },

    ...patch,
  }
}

describe(
  'canonical Tindeq results',
  () => {
    it(
      'materializes only metrics defined by the selected protocol',
      () => {
        const result =
          buildCanonicalTestResults(
            session,
            item(),
            'attempt-1',
            acquisition(),
          )

        expect(
          result.metrics.map(
            metric =>
              metric.metricKey,
          ),
        ).toEqual([
          'peak_nkg',
          'peak_n',
          'rfd_200',
          'time_to_peak',
        ])

        expect(
          result.metrics.some(
            metric =>
              metric.metricKey ===
              'mean_force',
          ),
        ).toBe(false)

        expect(
          result.metrics.some(
            metric =>
              metric.metricKey ===
              'impulse',
          ),
        ).toBe(false)
      },
    )

    it(
      'uses catalog labels and units instead of raw metric keys',
      () => {
        const result =
          buildCanonicalTestResults(
            session,
            item(),
            'attempt-1',
            acquisition(),
          )

        const peak =
          result.metrics.find(
            metric =>
              metric.metricKey ===
              'peak_n',
          )

        expect(peak).toMatchObject({
          metricLabel:
            'Picco',
          unit:
            'N',
          dimension:
            'force',
        })
      },
    )

    it(
      'marks exactly the acquisition primary metric as primary',
      () => {
        const result =
          buildCanonicalTestResults(
            session,
            item(),
            'attempt-1',
            acquisition(),
          )

        expect(
          result.metrics.filter(
            metric =>
              metric.isPrimary,
          ),
        ).toHaveLength(1)

        expect(
          primaryCanonicalMetric(
            result,
          )?.metricKey,
        ).toBe('peak_nkg')
      },
    )

    it(
      'preserves the complete comparison setup snapshot',
      () => {
        const result =
          buildCanonicalTestResults(
            session,
            item(),
            'attempt-1',
            acquisition(),
          )

        expect(result).toMatchObject({
          testSessionId:
            'session-1',

          testSessionItemId:
            'item-1',

          attemptId:
            'attempt-1',

          protocolKey:
            'peak_force',

          protocolVersion:
            '1.0',

          side:
            'right',

          grip:
            '20 mm',

          bodyWeightKg:
            60,

          measurementSource:
            'tindeq',

          qualityStatus:
            'VALID',

          rawCurvePath:
            'session-1/attempt-1.json',
        })

        expect(result.setup)
          .toEqual({
            edgeMm: 20,
            posture: 'seated',
          })
      },
    )

    it(
      'materializes the complete finger MVC metric set when available',
      () => {
        const result =
          buildCanonicalTestResults(
            session,
            item({
              protocolKey:
                'finger_mvc_20mm',
            }),
            'attempt-1',
            acquisition(),
          )

        expect(
          result.metrics.map(
            metric =>
              metric.metricKey,
          ),
        ).toEqual([
          'peak_nkg',
          'peak_n',
          'peak_kgf',
          'peak_percent_bw',
          'rfd_200',
          'time_to_peak',
        ])

        expect(
          result.metrics.some(
            metric =>
              metric.metricKey ===
              'asymmetry',
          ),
        ).toBe(false)
      },
    )

    it(
      'keeps an RFD selected window as the official primary metric',
      () => {
        const result =
          buildCanonicalTestResults(
            session,
            item({
              protocolKey:
                'rfd',
            }),
            'attempt-rfd',
            acquisition({
              primaryMetricKey:
                'rfd_selected',

              primaryValue:
                1250,

              primaryUnit:
                'N/s',

              secondaryMetrics: {
                ...acquisition()
                  .secondaryMetrics,

                rfd_selected:
                  1250,
              },
            }),
          )

        expect(
          primaryCanonicalMetric(
            result,
          ),
        ).toMatchObject({
          metricKey:
            'rfd_selected',

          value:
            1250,

          unit:
            'N/s',

          isPrimary:
            true,
        })

        expect(
          result.metrics.map(
            metric =>
              metric.metricKey,
          ),
        ).toEqual([
          'rfd_selected',
          'rfd_50',
          'rfd_100',
          'rfd_150',
          'rfd_200',
          'rfd_250',
          'peak_n',
          'time_to_peak',
        ])
      },
    )

    it(
      'does not materialize null or non finite values',
      () => {
        const result =
          buildCanonicalTestResults(
            session,
            item(),
            'attempt-1',
            acquisition({
              secondaryMetrics: {
                peak_n:
                  480,

                peak_nkg:
                  8,

                rfd_200:
                  null,

                time_to_peak:
                  Number.NaN,
              },
            }),
          )

        expect(
          result.metrics.map(
            metric =>
              metric.metricKey,
          ),
        ).toEqual([
          'peak_nkg',
          'peak_n',
        ])
      },
    )

    it(
      'supports a free measurement without inventing a primary result',
      () => {
        const result =
          buildCanonicalTestResults(
            session,
            item({
              protocolKey:
                'free_measurement',
            }),
            'attempt-free',
            acquisition({
              primaryMetricKey:
                null,

              primaryValue:
                null,

              primaryUnit:
                null,
            }),
          )

        expect(
          primaryCanonicalMetric(
            result,
          ),
        ).toBeNull()

        expect(
          result.metrics.map(
            metric =>
              metric.metricKey,
          ),
        ).toEqual([
          'peak_n',
          'mean_force',
          'impulse',
          'duration',
        ])
      },
    )

    it(
      'rejects a primary metric whose unit disagrees with the catalog',
      () => {
        expect(
          () =>
            buildCanonicalTestResults(
              session,
              item(),
              'attempt-1',
              acquisition({
                primaryUnit:
                  'kg',
              }),
            ),
        ).toThrow(
          'Primary metric unit mismatch',
        )
      },
    )

    it(
      'rejects an item from another session',
      () => {
        expect(
          () =>
            buildCanonicalTestResults(
              session,
              item({
                testSessionId:
                  'other-session',
              }),
              'attempt-1',
              acquisition(),
            ),
        ).toThrow(
          'Test item and session do not match.',
        )
      },
    )
  },
)
