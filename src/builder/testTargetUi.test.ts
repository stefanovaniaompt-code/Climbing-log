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
  findReferenceGroupForTarget,
  groupTestReferences,
  targetUnitsForReference,
} from './testTargetUi'

const base:
  TestOutcomeReference = {
    resultId:
      'r1',

    metricKey:
      'peak_kgf',

    metricLabel:
      'Picco',

    value:
      40,

    unit:
      'kgf',

    testedAt:
      '2026-01-01',

    measuredAt:
      '2026-01-01T10:00:00.000Z',

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
    },

    measurementSource:
      'tindeq',

    qualityStatus:
      'VALID',
  }

describe(
  'test target UI helpers',
  () => {
    it(
      'groups compatible retests together',
      () => {
        const groups =
          groupTestReferences([
            base,

            {
              ...base,
              resultId:
                'r2',
              value:
                45,
              measuredAt:
                '2026-05-01T10:00:00.000Z',
            },
          ])

        expect(groups)
          .toHaveLength(1)

        expect(
          groups[0].results,
        ).toHaveLength(2)

        expect(
          groups[0]
            .representative
            .resultId,
        ).toBe('r2')
      },
    )

    it(
      'keeps different setups separated',
      () => {
        const groups =
          groupTestReferences([
            base,

            {
              ...base,
              resultId:
                'r15',

              setup: {
                edgeMm: 15,
              },
            },
          ])

        expect(groups)
          .toHaveLength(2)
      },
    )

    it(
      'exposes only meaningful target units',
      () => {
        expect(
          targetUnitsForReference(
            'N/kg',
          ),
        ).toEqual([
          'kg',
          'N',
        ])

        expect(
          targetUnitsForReference(
            '%BW',
          ),
        ).toEqual([
          'kg_external',
          'kg_total',
        ])

        expect(
          targetUnitsForReference(
            'rep',
          ),
        ).toEqual([])
      },
    )

    it(
      'finds the original compatibility group from a locked snapshot',
      () => {
        const newer = {
          ...base,

          resultId:
            'new',

          value:
            48,

          measuredAt:
            '2026-09-01T10:00:00.000Z',
        }

        const groups =
          groupTestReferences([
            base,
            newer,
          ])

        const target =
          calculateDerivedSetTargets(
            base,
            [
              70,
              80,
            ],
            {
              prescriptionUnit:
                'kg',
            },
          )

        expect(
          findReferenceGroupForTarget(
            groups,
            target,
          )?.id,
        ).toBe('new')
      },
    )
  },
)
