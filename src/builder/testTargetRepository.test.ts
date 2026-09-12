import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateDerivedSetTargets,
  type TestOutcomeReference,
} from './derivedTargets'

import {
  targetFromRow,
  targetToRow,
} from './testTargetRepository'

const source:
  TestOutcomeReference = {
    resultId:
      'result-1',

    metricKey:
      'peak_kgf',

    metricLabel:
      'Picco',

    value:
      48.2,

    unit:
      'kgf',

    testedAt:
      '2026-09-12',

    measuredAt:
      '2026-09-12T10:30:00.000Z',

    side:
      'right',

    grip:
      '20 mm',

    bodyWeightKg:
      70,

    protocolKey:
      'finger_mvc_20mm',

    protocolVersion:
      '1.0',

    setup: {
      edgeMm: 20,
      gripType:
        'half-crimp',
    },

    measurementSource:
      'tindeq',

    qualityStatus:
      'VALID',
  }

describe(
  'builder test target repository',
  () => {
    it(
      'serializes an immutable source snapshot and every set target',
      () => {
        const target =
          calculateDerivedSetTargets(
            source,
            [
              50,
              60,
              70,
              80,
            ],
            {
              prescriptionUnit:
                'kg',

              reference:
                'latest_valid',

              lockedAt:
                '2026-09-12T11:00:00.000Z',
            },
          )

        const row =
          targetToRow(
            'exercise-1',
            target,
          )

        expect(
          row.test_result_id,
        ).toBe('result-1')

        expect(
          row.source_value,
        ).toBe(48.2)

        expect(
          row.source_protocol_key,
        ).toBe(
          'finger_mvc_20mm',
        )

        expect(
          row.set_targets,
        ).toHaveLength(4)

        expect(
          row.percentage,
        ).toBe(50)

        expect(
          row.calculated_target,
        ).toBe(24.1)
      },
    )

    it(
      'reconstructs the snapshot even if the source result FK becomes null',
      () => {
        const target =
          calculateDerivedSetTargets(
            source,
            [
              60,
              70,
            ],
            {
              prescriptionUnit:
                'kg',

              reference:
                'specific_result',

              lockedAt:
                '2026-09-12T11:00:00.000Z',
            },
          )

        const row = {
          ...targetToRow(
            'exercise-1',
            target,
          ),

          test_result_id:
            null,
        }

        const restored =
          targetFromRow(
            row,
          )

        expect(
          restored.resultId,
        ).toBeNull()

        expect(
          restored.sourceValue,
        ).toBe(48.2)

        expect(
          restored.metricLabel,
        ).toBe('Picco')

        expect(
          restored.setTargets.map(
            item =>
              item.percentage,
          ),
        ).toEqual([
          60,
          70,
        ])
      },
    )
  },
)
