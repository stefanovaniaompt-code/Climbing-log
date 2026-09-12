import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  buildComparisons,
  calculateAsymmetry,
  metricHistory,
  type TestData,
  type TestResultRecord,
  type TestSessionRecord,
} from './testAnalytics'

import {
  buildTestPresentation,
  testCaptureSourceLabel,
} from './testPresentation'

function session(
  patch:
    Partial<TestSessionRecord> &
    Pick<
      TestSessionRecord,
      'id' | 'testedAt'
    >,
): TestSessionRecord {
  return {
    id:
      patch.id,

    athleteId:
      'athlete-1',

    coachId:
      'coach-1',

    testedAt:
      patch.testedAt,

    createdAt:
      patch.createdAt ??
      `${patch.testedAt}T08:00:00.000Z`,

    bodyWeightKg:
      patch.bodyWeightKg ??
      70,

    protocolVersion:
      patch.protocolVersion ??
      '1.0',

    context:
      patch.context ?? {},

    notes:
      patch.notes ?? '',

    mode:
      patch.mode ??
      'live',

    status:
      patch.status ??
      'completed',
  }
}

function result(
  patch:
    Partial<TestResultRecord> &
    Pick<
      TestResultRecord,
      | 'id'
      | 'testSessionId'
      | 'value'
      | 'side'
    >,
): TestResultRecord {
  return {
    id:
      patch.id,

    testSessionId:
      patch.testSessionId,

    metricKey:
      patch.metricKey ??
      'peak_n',

    metricLabel:
      patch.metricLabel ??
      'Peak force',

    value:
      patch.value,

    unit:
      patch.unit ??
      'N',

    side:
      patch.side,

    grip:
      patch.grip ??
      '20 mm',

    normalizeToBodyWeight:
      patch.normalizeToBodyWeight ??
      false,

    setup:
      patch.setup ?? {
        edgeMm: 20,
        gripType:
          'half-crimp',
      },

    notes:
      patch.notes ?? '',

    protocolKey:
      patch.protocolKey ??
      'finger_mvc_20mm',

    protocolVersion:
      patch.protocolVersion ??
      '1.0',

    measurementSource:
      patch.measurementSource ??
      'tindeq',

    qualityStatus:
      patch.qualityStatus ??
      'VALID',

    isPrimary:
      patch.isPrimary ??
      true,

    measuredAt:
      patch.measuredAt ??
      null,
  }
}

function data(
  sessions:
    TestSessionRecord[],

  results:
    TestResultRecord[],
): TestData {
  return {
    source: 'demo',

    athletes: [
      {
        id:
          'athlete-1',

        name:
          'Ada',
      },
    ],

    sessions,
    results,
  }
}

describe(
  'longitudinal test history',
  () => {
    it(
      'compares repeated compatible tests and calculates delta percent',
      () => {
        const source =
          data(
            [
              session({
                id:
                  'old',
                testedAt:
                  '2026-06-01',
              }),

              session({
                id:
                  'new',
                testedAt:
                  '2026-09-01',
              }),
            ],

            [
              result({
                id:
                  'old-r',

                testSessionId:
                  'old',

                value:
                  400,

                side:
                  'right',

                measuredAt:
                  '2026-06-01T10:00:00.000Z',
              }),

              result({
                id:
                  'new-r',

                testSessionId:
                  'new',

                value:
                  480,

                side:
                  'right',

                measuredAt:
                  '2026-09-01T10:00:00.000Z',
              }),
            ],
          )

        const comparison =
          buildComparisons(
            source,
            'athlete-1',
          )[0]

        expect(
          comparison.latest,
        ).toBe(480)

        expect(
          comparison.previous,
        ).toBe(400)

        expect(
          comparison.delta,
        ).toBe(80)

        expect(
          comparison.percent,
        ).toBe(20)

        expect(
          comparison.comparable,
        ).toBe(true)
      },
    )

    it(
      'separates different protocol versions into different longitudinal series',
      () => {
        const source =
          data(
            [
              session({
                id:
                  'v1',
                testedAt:
                  '2026-06-01',
              }),

              session({
                id:
                  'v2',
                testedAt:
                  '2026-09-01',
              }),
            ],

            [
              result({
                id:
                  'r-v1',

                testSessionId:
                  'v1',

                value:
                  400,

                side:
                  'right',

                protocolVersion:
                  '1.0',
              }),

              result({
                id:
                  'r-v2',

                testSessionId:
                  'v2',

                value:
                  480,

                side:
                  'right',

                protocolVersion:
                  '2.0',
              }),
            ],
          )

        const comparisons =
          buildComparisons(
            source,
            'athlete-1',
          )

        expect(
          comparisons,
        ).toHaveLength(2)

        expect(
          comparisons.every(
            item =>
              !item.comparable,
          ),
        ).toBe(true)
      },
    )

    it(
      'separates materially different setups',
      () => {
        const source =
          data(
            [
              session({
                id:
                  'edge20',
                testedAt:
                  '2026-06-01',
              }),

              session({
                id:
                  'edge15',
                testedAt:
                  '2026-09-01',
              }),
            ],

            [
              result({
                id:
                  'r20',

                testSessionId:
                  'edge20',

                value:
                  400,

                side:
                  'right',

                setup: {
                  edgeMm: 20,
                  gripType:
                    'half-crimp',
                },
              }),

              result({
                id:
                  'r15',

                testSessionId:
                  'edge15',

                value:
                  430,

                side:
                  'right',

                setup: {
                  gripType:
                    'half-crimp',
                  edgeMm: 15,
                },
              }),
            ],
          )

        const presentation =
          buildTestPresentation(
            source,
            'athlete-1',
          )

        expect(
          presentation.groups,
        ).toHaveLength(2)

        expect(
          presentation.groups.map(
            group =>
              group.setupLabel,
          ),
        ).toEqual(
          expect.arrayContaining([
            expect.stringContaining(
              '15',
            ),
            expect.stringContaining(
              '20',
            ),
          ]),
        )
      },
    )

    it(
      'treats nested setup objects with different key order as the same setup',
      () => {
        const source =
          data(
            [
              session({
                id:
                  'nested-old',
                testedAt:
                  '2026-06-01',
              }),

              session({
                id:
                  'nested-new',
                testedAt:
                  '2026-09-01',
              }),
            ],

            [
              result({
                id:
                  'nested-r1',

                testSessionId:
                  'nested-old',

                value:
                  400,

                side:
                  'right',

                setup: {
                  edgeMm: 20,

                  posture: {
                    shoulder:
                      'neutral',

                    elbow:
                      90,
                  },
                },
              }),

              result({
                id:
                  'nested-r2',

                testSessionId:
                  'nested-new',

                value:
                  420,

                side:
                  'right',

                setup: {
                  posture: {
                    elbow:
                      90,

                    shoulder:
                      'neutral',
                  },

                  edgeMm: 20,
                },
              }),
            ],
          )

        const comparisons =
          buildComparisons(
            source,
            'athlete-1',
          )

        expect(
          comparisons,
        ).toHaveLength(1)

        expect(
          comparisons[0]
            .comparable,
        ).toBe(true)
      },
    )

    it(
      'does not publish draft remote sessions into athlete history',
      () => {
        const source =
          data(
            [
              session({
                id:
                  'remote-draft',

                testedAt:
                  '2026-09-10',

                mode:
                  'remote',

                status:
                  'in_progress',
              }),
            ],

            [
              result({
                id:
                  'draft-result',

                testSessionId:
                  'remote-draft',

                value:
                  15,

                side:
                  null,

                metricKey:
                  'complete_reps',

                metricLabel:
                  'Ripetizioni complete',

                unit:
                  'rep',

                protocolKey:
                  'pullup_max',

                measurementSource:
                  'manual',
              }),
            ],
          )

        expect(
          buildComparisons(
            source,
            'athlete-1',
          ),
        ).toHaveLength(0)

        expect(
          buildTestPresentation(
            source,
            'athlete-1',
          ).sessions,
        ).toHaveLength(0)
      },
    )

    it(
      'uses the real result date for remote tests completed on different days',
      () => {
        const remote =
          session({
            id:
              'remote-complete',

            testedAt:
              '2026-09-10',

            mode:
              'remote',

            status:
              'completed',

            context: {
              capture_source:
                'remote_manual',
            },
          })

        const source =
          data(
            [remote],

            [
              result({
                id:
                  'pullups',

                testSessionId:
                  remote.id,

                value:
                  14,

                side:
                  null,

                metricKey:
                  'complete_reps',

                metricLabel:
                  'Ripetizioni complete',

                unit:
                  'rep',

                protocolKey:
                  'pullup_max',

                measurementSource:
                  'manual',

                setup: {},

                grip:
                  'barra',

                measuredAt:
                  '2026-09-12T09:00:00.000Z',
              }),
            ],
          )

        const comparison =
          buildComparisons(
            source,
            'athlete-1',
          )[0]

        expect(
          comparison
            .latestMeasuredAt,
        ).toBe(
          '2026-09-12T09:00:00.000Z',
        )

        expect(
          metricHistory(
            source,
            'athlete-1',
            comparison.key,
          )[0].date,
        ).toBe(
          '2026-09-12',
        )

        expect(
          buildTestPresentation(
            source,
            'athlete-1',
          ).latestTestedAt,
        ).toBe(
          '2026-09-12',
        )

        expect(
          testCaptureSourceLabel(
            remote,
          ),
        ).toBe(
          'A distanza',
        )
      },
    )

    it(
      'pairs left and right on the same graph but never calculates asymmetry across different sessions',
      () => {
        const source =
          data(
            [
              session({
                id:
                  'paired',
                testedAt:
                  '2026-06-01',
              }),

              session({
                id:
                  'right-only',
                testedAt:
                  '2026-09-01',
              }),
            ],

            [
              result({
                id:
                  'left-old',

                testSessionId:
                  'paired',

                value:
                  400,

                side:
                  'left',
              }),

              result({
                id:
                  'right-old',

                testSessionId:
                  'paired',

                value:
                  420,

                side:
                  'right',
              }),

              result({
                id:
                  'right-new',

                testSessionId:
                  'right-only',

                value:
                  500,

                side:
                  'right',
              }),
            ],
          )

        const comparisons =
          buildComparisons(
            source,
            'athlete-1',
          )

        const presentation =
          buildTestPresentation(
            source,
            'athlete-1',
          )

        expect(
          presentation.groups,
        ).toHaveLength(1)

        expect(
          presentation.groups[0]
            .left,
        ).not.toBeNull()

        expect(
          presentation.groups[0]
            .right,
        ).not.toBeNull()

        expect(
          calculateAsymmetry(
            comparisons,
          ),
        ).toHaveLength(0)
      },
    )

    it(
      'ignores INVALID results but keeps selected REVIEW results visible',
      () => {
        const source =
          data(
            [
              session({
                id:
                  'quality',
                testedAt:
                  '2026-09-01',
              }),
            ],

            [
              result({
                id:
                  'invalid',

                testSessionId:
                  'quality',

                value:
                  999,

                side:
                  'right',

                qualityStatus:
                  'INVALID',
              }),

              result({
                id:
                  'review',

                testSessionId:
                  'quality',

                value:
                  450,

                side:
                  'left',

                qualityStatus:
                  'REVIEW',
              }),
            ],
          )

        const comparisons =
          buildComparisons(
            source,
            'athlete-1',
          )

        expect(
          comparisons,
        ).toHaveLength(1)

        expect(
          comparisons[0]
            .latest,
        ).toBe(450)

        expect(
          comparisons[0]
            .latestQualityStatus,
        ).toBe(
          'REVIEW',
        )
      },
    )
  },
)
