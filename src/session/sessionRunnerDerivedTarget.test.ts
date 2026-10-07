import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  buildActualFromPrescription,
  getDerivedSetTargets,
  getSetCount,
  getVariableSeries,
  type RunnerExercise,
} from './sessionRunner'

const exercise:
  RunnerExercise = {
    id:
      'exercise-1',

    order:
      1,

    name:
      'Block lift 20 mm',

    prescription: {
      sets: 3,
      reps: 1,
    },

    calculationContext: {
      test_target: {
        metric_key:
          'peak_kgf',

        source_metric_label:
          'Peak',

        source_value:
          48.2,

        source_unit:
          'kgf',

        locked_at:
          '2026-09-12T11:00:00.000Z',

        set_targets: [
          {
            setNumber:
              1,
            percentage:
              50,
            calculatedTarget:
              24.1,
            targetUnit:
              'kg',
          },

          {
            setNumber:
              2,
            percentage:
              60,
            calculatedTarget:
              28.92,
            targetUnit:
              'kg',
          },

          {
            setNumber:
              3,
            percentage:
              70,
            calculatedTarget:
              33.74,
            targetUnit:
              'kg',
          },

          {
            setNumber:
              4,
            percentage:
              80,
            calculatedTarget:
              38.56,
            targetUnit:
              'kg',
          },
        ],
      },
    },

    targetRpeMin:
      7,

    targetRpeMax:
      8,

    restSeconds:
      180,

    instructions:
      null,

    progress:
      null,
  }

describe(
  'session runner derived test target',
  () => {
    it(
      'uses derived target set count',
      () => {
        expect(
          getSetCount(
            exercise,
          ),
        ).toBe(4)
      },
    )

    it(
      'shows calculated load for every set',
      () => {
        expect(
          getVariableSeries(
            exercise,
          ),
        ).toEqual([
          '50% = 24.1 kg · 1 rep',
          '60% = 28.92 kg · 1 rep',
          '70% = 33.74 kg · 1 rep',
          '80% = 38.56 kg · 1 rep',
        ])
      },
    )

    it('combines each test-derived load percentage with that set’s own repetitions', () => {
      const fiveSetExercise: RunnerExercise = {
        ...exercise,
        prescription: {
          sets: 5,
          steps: [
            { label: 'Set 1', loadKg: 85, reps: 10, seconds: 0 },
            { label: 'Set 2', loadKg: 94, reps: 8, seconds: 0 },
            { label: 'Set 3', loadKg: 101.5, reps: 6, seconds: 0 },
            { label: 'Set 4', loadKg: 108.5, reps: 4, seconds: 0 },
            { label: 'Set 5', loadKg: 122.5, reps: 3, seconds: 0 },
          ],
        },
        calculationContext: {
          test_target: {
            set_targets: [50, 60, 70, 80, 90].map((percentage, index) => ({
              setNumber: index + 1,
              percentage,
              calculatedTarget: percentage / 2,
              targetUnit: 'kg',
            })),
          },
        },
      }

      expect(getVariableSeries(fiveSetExercise)).toEqual([
        '50% = 25 kg · 10 rep',
        '60% = 30 kg · 8 rep',
        '70% = 35 kg · 6 rep',
        '80% = 40 kg · 4 rep',
        '90% = 45 kg · 3 rep',
      ])
    })

    it(
      'reads every derived set',
      () => {
        expect(
          getDerivedSetTargets(
            exercise,
          ),
        ).toHaveLength(4)
      },
    )

    it(
      'copies immutable target snapshot into exercise log',
      () => {
        const actual =
          buildActualFromPrescription(
            exercise.prescription,
            exercise
              .calculationContext,
          )

        expect(
          actual
            .test_target_snapshot,
        ).toEqual(
          exercise
            .calculationContext
            .test_target,
        )
      },
    )
  },
)
