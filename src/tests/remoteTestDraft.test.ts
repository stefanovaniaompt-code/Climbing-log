import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  AppProfile,
} from '../onboarding/types'

import {
  addRemoteTestItem,
  completeRemoteTestItem,
  createRemoteTestAssignment,
  finishRemoteTestSession,
  remoteTestProgress,
  saveRemoteTestDraft,
  setRemoteManualMetric,
  startRemoteTestItem,
  startRemoteTestSession,
} from './remoteTestRunner'

const coach:
  AppProfile = {
    userId: 'coach-1',
    displayName: 'Monica',
    role: 'coach',
    athleteId: null,

    capabilities: {
      canAccessCoachArea: true,
      canAccessAthleteArea: false,
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
      'Mario',

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

function assignment() {
  let state =
    createRemoteTestAssignment(
      coach,
      'athlete-1',
      {
        sessionId:
          'remote-manual',

        bodyWeightKg:
          70,
      },
    )

  state =
    addRemoteTestItem(
      coach,
      state,
      'pullup_max',
      {
        itemId:
          'max-pullups',

        grip:
          'barra',
      },
    )

  state =
    addRemoteTestItem(
      coach,
      state,
      'pullup_1rm',
      {
        itemId:
          'one-rm',

        grip:
          'barra',
      },
    )

  state =
    addRemoteTestItem(
      coach,
      state,
      'side_plank',
      {
        itemId:
          'side-plank',

        side:
          'right',
      },
    )

  return startRemoteTestSession(
    athlete,
    state,
    '2026-12-10T08:00:00.000Z',
  )
}

describe(
  'manual remote testing',
  () => {
    it(
      'rejects Tindeq-only protocols from remote assignments',
      () => {
        const state =
          createRemoteTestAssignment(
            coach,
            'athlete-1',
          )

        expect(
          () =>
            addRemoteTestItem(
              coach,
              state,
              'peak_force',
            ),
        ).toThrow(
          'requires live instrumentation',
        )
      },
    )

    it(
      'stores max pullups entered manually by the athlete',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestItem(
            athlete,
            state,
            'max-pullups',
          )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'max-pullups',
            'complete_reps',
            14,
          )

        expect(
          state.items[0]
            .values,
        ).toEqual([
          {
            metricKey:
              'complete_reps',

            metricLabel:
              'Ripetizioni complete',

            value:
              14,

            unit:
              'rep',
          },
        ])

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'max-pullups',
          )

        expect(
          state.items[0]
            .item.status,
        ).toBe(
          'completed',
        )
      },
    )

    it(
      'stores 1RM external load manually',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestItem(
            athlete,
            state,
            'one-rm',
          )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'one-rm',
            'external_load',
            32.5,
          )

        expect(
          state.items[1]
            .values[0],
        ).toEqual({
          metricKey:
            'external_load',

          metricLabel:
            'Carico esterno',

          value:
            32.5,

          unit:
            'kg',
        })
      },
    )

    it(
      'does not allow a test to be checked completed without a result',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestItem(
            athlete,
            state,
            'max-pullups',
          )

        expect(
          () =>
            completeRemoteTestItem(
              athlete,
              state,
              'max-pullups',
            ),
        ).toThrow(
          'Enter the test result',
        )
      },
    )

    it(
      'preserves entered values and completed flags in a draft',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestItem(
            athlete,
            state,
            'max-pullups',
          )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'max-pullups',
            'complete_reps',
            12,
          )

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'max-pullups',
          )

        state =
          saveRemoteTestDraft(
            athlete,
            state,
          )

        expect(
          state.session.status,
        ).toBe(
          'in_progress',
        )

        expect(
          state.items[0]
            .item.status,
        ).toBe(
          'completed',
        )

        expect(
          state.items[0]
            .values[0].value,
        ).toBe(12)

        expect(
          state.items[1]
            .item.status,
        ).toBe(
          'pending',
        )

        expect(
          remoteTestProgress(
            state,
          ).percent,
        ).toBeCloseTo(
          33.3333333333,
          8,
        )
      },
    )

    it(
      'can continue the same battery on another day',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestItem(
            athlete,
            state,
            'max-pullups',
          )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'max-pullups',
            'complete_reps',
            12,
          )

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'max-pullups',
          )

        state =
          saveRemoteTestDraft(
            athlete,
            state,
          )

        state =
          startRemoteTestItem(
            athlete,
            state,
            'one-rm',
          )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'one-rm',
            'external_load',
            30,
          )

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'one-rm',
          )

        expect(
          state.session.status,
        ).toBe(
          'in_progress',
        )

        expect(
          state.items.map(
            entry =>
              entry.item.status,
          ),
        ).toEqual([
          'completed',
          'completed',
          'pending',
        ])
      },
    )

    it(
      'requires all items to be completed or explicitly skipped before final submission',
      () => {
        const state =
          assignment()

        expect(
          () =>
            finishRemoteTestSession(
              athlete,
              state,
            ),
        ).toThrow(
          'must be completed or skipped',
        )
      },
    )
  },
)
