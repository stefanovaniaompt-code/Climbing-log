import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateDerivedSetTargets,
  calculateDerivedTarget,
  chooseTestReference,
  compatibleTestReference,
  hasNewerTest,
  type TestOutcomeReference,
} from './derivedTargets'

const old:
  TestOutcomeReference = {
    resultId:
      'old',

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

const latest:
  TestOutcomeReference = {
    ...old,

    resultId:
      'new',

    value:
      48.2,

    testedAt:
      '2026-09-12',

    measuredAt:
      '2026-09-12T10:00:00.000Z',
  }

describe(
  'derived exercise targets',
  () => {
    it(
      'chooses latest, PB or a specific result',
      () => {
        expect(
          chooseTestReference(
            [old, latest],
            'latest_valid',
          )?.resultId,
        ).toBe('new')

        expect(
          chooseTestReference(
            [
              old,
              {
                ...latest,
                value: 39,
              },
            ],
            'personal_best',
          )?.resultId,
        ).toBe('old')

        expect(
          chooseTestReference(
            [old, latest],
            'specific_result',
            'old',
          )?.resultId,
        ).toBe('old')
      },
    )

    it(
      'does not automatically use REVIEW results',
      () => {
        const review = {
          ...latest,

          resultId:
            'review',

          measuredAt:
            '2026-10-01T10:00:00.000Z',

          value:
            55,

          qualityStatus:
            'REVIEW' as const,
        }

        expect(
          chooseTestReference(
            [
              old,
              latest,
              review,
            ],
            'latest_valid',
          )?.resultId,
        ).toBe('new')

        expect(
          chooseTestReference(
            [
              old,
              latest,
              review,
            ],
            'specific_result',
            'review',
          )?.resultId,
        ).toBe('review')
      },
    )

    it(
      'calculates different percentages for each set',
      () => {
        const target =
          calculateDerivedSetTargets(
            latest,
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
            },
          )

        expect(
          target.setTargets.map(
            set => ({
              percentage:
                set.percentage,

              load:
                Number(
                  set
                    .calculatedTarget
                    .toFixed(2),
                ),
            }),
          ),
        ).toEqual([
          {
            percentage: 50,
            load: 24.1,
          },
          {
            percentage: 60,
            load: 28.92,
          },
          {
            percentage: 70,
            load: 33.74,
          },
          {
            percentage: 80,
            load: 38.56,
          },
        ])

        expect(
          target.sourceValue,
        ).toBe(48.2)

        expect(
          target.resultId,
        ).toBe('new')
      },
    )

    it(
      'keeps the old single-percentage API compatible',
      () => {
        const target =
          calculateDerivedTarget(
            latest,
            80,
            {
              prescriptionUnit:
                'kg',
            },
          )

        expect(
          target.percentage,
        ).toBe(80)

        expect(
          target.calculatedTarget,
        ).toBeCloseTo(
          38.56,
        )

        expect(
          target.setTargets,
        ).toHaveLength(1)
      },
    )

    it(
      'converts N to kg for load prescriptions',
      () => {
        const source = {
          ...latest,

          metricKey:
            'peak_n',

          value:
            490.3325,

          unit:
            'N',
        }

        const target =
          calculateDerivedTarget(
            source,
            80,
            {
              prescriptionUnit:
                'kg',
            },
          )

        expect(
          target.calculatedTarget,
        ).toBeCloseTo(
          40,
          6,
        )
      },
    )

    it(
      'converts relative N/kg using body weight',
      () => {
        const source = {
          ...latest,

          metricKey:
            'peak_nkg',

          value:
            7,

          unit:
            'N/kg',

          bodyWeightKg:
            70,
        }

        const target =
          calculateDerivedTarget(
            source,
            80,
            {
              prescriptionUnit:
                'kg',
            },
          )

        expect(
          target.calculatedTarget,
        ).toBeCloseTo(
          39.9729,
          3,
        )
      },
    )

    it(
      'converts total pullup load to external load',
      () => {
        const pullup = {
          ...latest,

          metricKey:
            'total_load',

          value:
            100,

          unit:
            'kg_total',

          bodyWeightKg:
            70,
        }

        expect(
          calculateDerivedTarget(
            pullup,
            80,
            {
              prescriptionUnit:
                'kg_external',
            },
          ).calculatedTarget,
        ).toBe(10)
      },
    )

    it(
      'can derive external pullup load from percent body weight',
      () => {
        const pullup = {
          ...latest,

          metricKey:
            'one_rm_percent_bw',

          value:
            150,

          unit:
            '%BW',

          bodyWeightKg:
            70,
        }

        expect(
          calculateDerivedTarget(
            pullup,
            80,
            {
              prescriptionUnit:
                'kg_external',
            },
          ).calculatedTarget,
        ).toBeCloseTo(
          14,
          6,
        )
      },
    )

    it(
      'rejects unsupported unit conversions',
      () => {
        expect(
          () =>
            calculateDerivedTarget(
              {
                ...latest,

                unit:
                  'rep',
              },
              80,
              {
                prescriptionUnit:
                  'kg',
              },
            ),
        ).toThrow(
          'Conversione non supportata',
        )
      },
    )

    it(
      'signals a compatible newer result without changing the snapshot',
      () => {
        const locked =
          calculateDerivedTarget(
            old,
            75,
            {
              prescriptionUnit:
                'kg',
            },
          )

        expect(
          hasNewerTest(
            locked,
            [latest],
          ),
        ).toBe(true)

        expect(
          locked.resultId,
        ).toBe('old')

        expect(
          locked.sourceValue,
        ).toBe(40)
      },
    )

    it(
      'ignores a newer test with an incompatible setup',
      () => {
        const locked =
          calculateDerivedTarget(
            old,
            75,
            {
              prescriptionUnit:
                'kg',
            },
          )

        const changed = {
          ...latest,

          setup: {
            edgeMm: 15,
          },
        }

        expect(
          hasNewerTest(
            locked,
            [changed],
          ),
        ).toBe(false)

        expect(
          compatibleTestReference(
            old,
            changed,
          ),
        ).toBe(false)
      },
    )
  },
)
