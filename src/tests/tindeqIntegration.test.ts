import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  AppProfile,
} from '../onboarding/types'

import type {
  AcquisitionResult,
} from '../tindeq/acquisition'

import {
  calculateDerivedSetTargets,
  type TestOutcomeReference,
} from '../builder/derivedTargets'

import {
  activateLiveTestItem,
  addLiveTestItem,
  beginLiveCountdown,
  completeActiveLiveTestItem,
  createLiveTestRunner,
  finishLiveTestSession,
  markLiveAcquisitionStarted,
  recordLiveAcquisition,
  selectLiveTestAttempt,
  selectedLiveAttempt,
} from './liveTestRunner'

import {
  addRemoteTestItem,
  completeRemoteTestItem,
  createRemoteTestAssignment,
  finishRemoteTestSession,
  setRemoteManualMetric,
  startRemoteTestItem,
  startRemoteTestSession,
} from './remoteTestRunner'

import {
  buildTestPresentation,
} from './testPresentation'

import type {
  TestData,
} from './testAnalytics'

const coach:
  AppProfile = {
    userId:
      'coach-1',

    displayName:
      'Monica',

    role:
      'coach',

    athleteId:
      null,

    capabilities: {
      canAccessCoachArea:
        true,

      canAccessAthleteArea:
        false,
    },

    workspaceId:
      'workspace-1',

    workspaceName:
      'Coach workspace',

    onboardingCompletedAt:
      '2026-01-01T10:00:00.000Z',

    mustChangePassword:
      false,
  }

const athlete:
  AppProfile = {
    userId:
      'athlete-user-1',

    displayName:
      'Ada',

    role:
      'athlete',

    athleteId:
      'athlete-1',

    capabilities: {
      canAccessCoachArea:
        false,

      canAccessAthleteArea:
        true,
    },

    workspaceId:
      'workspace-1',

    workspaceName:
      'Coach workspace',

    onboardingCompletedAt:
      '2026-01-01T10:00:00.000Z',

    mustChangePassword:
      false,
  }

function validAcquisition():
  AcquisitionResult {
  return {
    samples:
      Object.freeze([]),

    startedAt:
      '2026-09-12T09:00:00.000Z',

    endedAt:
      '2026-09-12T09:00:05.000Z',

    deviceInfo: {
      id:
        'progressor-test',

      name:
        'Tindeq Progressor',
    },

    qualityStatus:
      'VALID',

    qualityFlags:
      [],

    primaryMetricKey:
      'peak_nkg',

    primaryValue:
      8,

    primaryUnit:
      'N/kg',

    secondaryMetrics: {
      peak_nkg:
        8,

      peak_n:
        480,

      rfd_200:
        1200,

      time_to_peak:
        420,
    },

    samplingMetadata: {
      sampleCount:
        400,

      durationSeconds:
        5,

      estimatedHz:
        80,

      maximumGapMs:
        14,
    },
  }
}

describe(
  'Tindeq complete integration',
  () => {
    it(
      'moves a live Tindeq result through history and into a derived program load',
      () => {
        let state =
          createLiveTestRunner(
            coach,
            'athlete-1',
            {
              sessionId:
                'live-session',

              testedAt:
                '2026-09-12',

              bodyWeightKg:
                60,
            },
          )

        state =
          addLiveTestItem(
            state,
            'peak_force',
            {
              itemId:
                'live-item',

              side:
                'right',

              grip:
                '20 mm',

              config: {
                edgeMm:
                  20,

                posture:
                  'seated',
              },
            },
          )

        state =
          activateLiveTestItem(
            state,
            'live-item',
          )

        state =
          beginLiveCountdown(
            state,
            0,
          )

        state =
          markLiveAcquisitionStarted(
            state,
          )

        let id = 0

        state =
          recordLiveAcquisition(
            state,
            coach,
            validAcquisition(),
            () =>
              `live-id-${++id}`,
          )

        const attemptId =
          state.items[0]
            .attempts[0]
            .attempt
            .attemptId

        state =
          selectLiveTestAttempt(
            state,
            attemptId,
          )

        const official =
          selectedLiveAttempt(
            state,
            'live-item',
          )

        expect(official)
          .not.toBeNull()

        state =
          completeActiveLiveTestItem(
            state,
          )

        state =
          finishLiveTestSession(
            state,
            '2026-09-12T09:10:00.000Z',
          )

        const canonical =
          official!.canonical

        const data:
          TestData = {
            source:
              'legacy-v1',

            athletes: [
              {
                id:
                  'athlete-1',

                name:
                  'Ada',
              },
            ],

            sessions: [
              {
                id:
                  state.session.id,

                athleteId:
                  'athlete-1',

                coachId:
                  'coach-1',

                testedAt:
                  state.session
                    .testedAt,

                createdAt:
                  '2026-09-12T09:00:00.000Z',

                bodyWeightKg:
                  60,

                protocolVersion:
                  '1.0',

                context:
                  {},

                notes:
                  '',

                mode:
                  'live',

                status:
                  'completed',
              },
            ],

            results:
              canonical.metrics.map(
                (
                  metric,
                  index,
                ) => ({
                  id:
                    `result-${index}`,

                  testSessionId:
                    state.session.id,

                  metricKey:
                    metric.metricKey,

                  metricLabel:
                    metric.metricLabel,

                  value:
                    metric.value,

                  unit:
                    metric.unit,

                  side:
                    canonical.side,

                  grip:
                    canonical.grip,

                  normalizeToBodyWeight:
                    metric
                      .normalizeToBodyWeight,

                  setup:
                    canonical.setup,

                  notes:
                    '',

                  protocolKey:
                    canonical
                      .protocolKey,

                  protocolVersion:
                    canonical
                      .protocolVersion,

                  measurementSource:
                    'tindeq',

                  qualityStatus:
                    'VALID',

                  isPrimary:
                    metric.isPrimary,

                  measuredAt:
                    canonical
                      .endedAt,
                }),
              ),
          }

        const presentation =
          buildTestPresentation(
            data,
            'athlete-1',
          )

        const peakGroup =
          presentation.groups.find(
            group =>
              group.metricKey ===
              'peak_n',
          )

        expect(
          peakGroup
            ?.right
            ?.latest,
        ).toBe(480)

        const peakMetric =
          canonical.metrics.find(
            metric =>
              metric.metricKey ===
              'peak_n',
          )!

        const reference:
          TestOutcomeReference = {
            resultId:
              'result-peak-n',

            metricKey:
              peakMetric.metricKey,

            metricLabel:
              peakMetric.metricLabel,

            value:
              peakMetric.value,

            unit:
              peakMetric.unit,

            testedAt:
              state.session
                .testedAt,

            measuredAt:
              canonical.endedAt,

            side:
              canonical.side,

            grip:
              canonical.grip,

            bodyWeightKg:
              60,

            protocolKey:
              canonical
                .protocolKey,

            protocolVersion:
              canonical
                .protocolVersion,

            setup:
              canonical.setup,

            measurementSource:
              'tindeq',

            qualityStatus:
              'VALID',

            higherIsBetter:
              true,
          }

        const prescription =
          calculateDerivedSetTargets(
            reference,
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
          prescription
            .setTargets,
        ).toHaveLength(4)

        expect(
          prescription
            .setTargets[0]
            .calculatedTarget,
        ).toBeCloseTo(
          24.473,
          2,
        )

        expect(
          prescription
            .setTargets[3]
            .calculatedTarget,
        ).toBeCloseTo(
          39.157,
          2,
        )
      },
    )

    it(
      'moves a remote manual result into the same athlete history model',
      () => {
        let remote =
          createRemoteTestAssignment(
            coach,
            'athlete-1',
            {
              sessionId:
                'remote-session',

              testedAt:
                '2026-09-13',
            },
          )

        remote =
          addRemoteTestItem(
            coach,
            remote,
            'pullup_max',
            {
              itemId:
                'pullup-item',

              grip:
                'barra',
            },
          )

        remote =
          startRemoteTestSession(
            athlete,
            remote,
            '2026-09-13T09:00:00.000Z',
          )

        remote =
          startRemoteTestItem(
            athlete,
            remote,
            'pullup-item',
          )

        remote =
          setRemoteManualMetric(
            athlete,
            remote,
            'pullup-item',
            'complete_reps',
            14,
          )

        remote =
          completeRemoteTestItem(
            athlete,
            remote,
            'pullup-item',
            '2026-09-13T09:10:00.000Z',
          )

        remote =
          finishRemoteTestSession(
            athlete,
            remote,
            '2026-09-13T09:11:00.000Z',
          )

        const value =
          remote.items[0]
            .values[0]

        const history:
          TestData = {
            source:
              'legacy-v1',

            athletes: [
              {
                id:
                  'athlete-1',

                name:
                  'Ada',
              },
            ],

            sessions: [
              {
                id:
                  remote.session.id,

                athleteId:
                  'athlete-1',

                coachId:
                  'coach-1',

                testedAt:
                  remote.session
                    .testedAt,

                createdAt:
                  '2026-09-13T09:00:00.000Z',

                bodyWeightKg:
                  null,

                protocolVersion:
                  '1.0',

                context:
                  {},

                notes:
                  '',

                mode:
                  'remote',

                status:
                  'completed',
              },
            ],

            results: [
              {
                id:
                  'remote-result',

                testSessionId:
                  remote.session.id,

                metricKey:
                  value.metricKey,

                metricLabel:
                  value.metricLabel,

                value:
                  value.value,

                unit:
                  value.unit,

                side:
                  null,

                grip:
                  'barra',

                normalizeToBodyWeight:
                  false,

                setup:
                  {},

                notes:
                  '',

                protocolKey:
                  'pullup_max',

                protocolVersion:
                  '1.0',

                measurementSource:
                  'manual',

                qualityStatus:
                  'VALID',

                isPrimary:
                  true,

                measuredAt:
                  remote.items[0]
                    .completedAt,
              },
            ],
          }

        const presentation =
          buildTestPresentation(
            history,
            'athlete-1',
          )

        const group =
          presentation.groups.find(
            item =>
              item.metricKey ===
              'complete_reps',
          )

        expect(
          group
            ?.bilateral
            ?.latest,
        ).toBe(14)
      },
    )
  },
)
