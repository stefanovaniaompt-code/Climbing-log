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
  cancelRemoteTestAssignment,
  completeRemoteTestItem,
  createRemoteTestAssignment,
  finishRemoteTestSession,
  remoteTestProgress,
  saveRemoteTestDraft,
  setRemoteManualMetric,
  skipRemoteTestItem,
  startRemoteTestItem,
  startRemoteTestSession,
} from './remoteTestRunner'

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

const otherAthlete:
  AppProfile = {
    ...athlete,

    userId:
      'athlete-user-2',

    athleteId:
      'athlete-2',
  }

function assignment() {
  let state =
    createRemoteTestAssignment(
      coach,
      'athlete-1',
      {
        sessionId:
          'remote-session',

        bodyWeightKg:
          70,

        context: {
          instructions:
            'Riposo completo il giorno prima.',
        },
      },
    )

  state =
    addRemoteTestItem(
      coach,
      state,
      'pullup_max',
      {
        itemId:
          'remote-item-1',

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
          'remote-item-2',

        grip:
          'barra',
      },
    )

  return state
}

describe(
  'remote test assignment',
  () => {
    it(
      'is created by a coach in assigned state and is manual only',
      () => {
        const state =
          assignment()

        expect(
          state.session,
        ).toMatchObject({
          id:
            'remote-session',

          athleteId:
            'athlete-1',

          coachId:
            'coach-1',

          mode:
            'remote',

          status:
            'assigned',

          bodyWeightKg:
            70,

          startedAt:
            null,

          endedAt:
            null,
        })

        expect(
          state.items.map(
            entry => ({
              id:
                entry.item.id,

              order:
                entry.item
                  .itemOrder,

              source:
                entry.item
                  .source,

              status:
                entry.item
                  .status,
            }),
          ),
        ).toEqual([
          {
            id:
              'remote-item-1',

            order:
              1,

            source:
              'manual',

            status:
              'pending',
          },

          {
            id:
              'remote-item-2',

            order:
              2,

            source:
              'manual',

            status:
              'pending',
          },
        ])
      },
    )

    it(
      'does not let an athlete create a remote assignment',
      () => {
        expect(
          () =>
            createRemoteTestAssignment(
              athlete,
              'athlete-1',
            ),
        ).toThrow(
          'Only a coach',
        )
      },
    )

    it(
      'does not allow Tindeq-only tests in a remote assignment',
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
      'allows only the assigned athlete to start the session',
      () => {
        const state =
          assignment()

        expect(
          () =>
            startRemoteTestSession(
              otherAthlete,
              state,
            ),
        ).toThrow(
          'assigned to another athlete',
        )

        const started =
          startRemoteTestSession(
            athlete,
            state,
            '2026-12-10T08:30:00.000Z',
          )

        expect(
          started.session
            .status,
        ).toBe(
          'in_progress',
        )

        expect(
          started.session
            .startedAt,
        ).toBe(
          '2026-12-10T08:30:00.000Z',
        )

        expect(
          started.session
            .testedAt,
        ).toBe(
          '2026-12-10',
        )
      },
    )

    it(
      'prevents coach edits after the athlete has started',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestSession(
            athlete,
            state,
          )

        expect(
          () =>
            addRemoteTestItem(
              coach,
              state,
              'pushup_max',
            ),
        ).toThrow(
          'cannot be changed after the athlete has started',
        )
      },
    )

    it(
      'requires a real entered result before the athlete can flag a test completed',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestSession(
            athlete,
            state,
          )

        state =
          startRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
          )

        expect(
          () =>
            completeRemoteTestItem(
              athlete,
              state,
              'remote-item-1',
            ),
        ).toThrow(
          'Enter the test result',
        )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'remote-item-1',
            'complete_reps',
            14,
          )

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
          )

        expect(
          state.items[0]
            .item.status,
        ).toBe(
          'completed',
        )

        expect(
          state.items[0]
            .values[0]
            .value,
        ).toBe(14)
      },
    )

    it(
      'executes one remote item at a time',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestSession(
            athlete,
            state,
          )

        state =
          startRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
          )

        expect(
          () =>
            startRemoteTestItem(
              athlete,
              state,
              'remote-item-2',
            ),
        ).toThrow(
          'already active',
        )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'remote-item-1',
            'complete_reps',
            13,
          )

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
          )

        state =
          startRemoteTestItem(
            athlete,
            state,
            'remote-item-2',
          )

        expect(
          state.activeItemId,
        ).toBe(
          'remote-item-2',
        )
      },
    )

    it(
      'preserves a partially completed battery when saving draft',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestSession(
            athlete,
            state,
          )

        state =
          startRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
          )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'remote-item-1',
            'complete_reps',
            12,
          )

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
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
          state.activeItemId,
        ).toBeNull()

        expect(
          state.items.map(
            entry =>
              entry.item.status,
          ),
        ).toEqual([
          'completed',
          'pending',
        ])

        expect(
          remoteTestProgress(
            state,
          ).percent,
        ).toBe(50)
      },
    )

    it(
      'can continue the remaining tests in another session',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestSession(
            athlete,
            state,
            '2026-12-10T08:00:00.000Z',
          )

        state =
          startRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
          )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'remote-item-1',
            'complete_reps',
            12,
          )

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
            '2026-12-10T08:15:00.000Z',
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
            'remote-item-2',
          )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'remote-item-2',
            'external_load',
            30,
          )

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'remote-item-2',
            '2026-12-13T09:15:00.000Z',
          )

        expect(
          state.items.map(
            entry =>
              entry.item.status,
          ),
        ).toEqual([
          'completed',
          'completed',
        ])

        expect(
          state.items[0]
            .completedAt,
        ).toBe(
          '2026-12-10T08:15:00.000Z',
        )

        expect(
          state.items[1]
            .completedAt,
        ).toBe(
          '2026-12-13T09:15:00.000Z',
        )
      },
    )

    it(
      'allows an athlete to explicitly skip a test that cannot be performed',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestSession(
            athlete,
            state,
          )

        state =
          skipRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
          )

        expect(
          state.items[0]
            .item.status,
        ).toBe(
          'skipped',
        )

        expect(
          state.items[1]
            .item.status,
        ).toBe(
          'pending',
        )
      },
    )

    it(
      'cannot submit the battery while tests remain pending',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestSession(
            athlete,
            state,
          )

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

    it(
      'finishes after every test is completed or explicitly skipped',
      () => {
        let state =
          assignment()

        state =
          startRemoteTestSession(
            athlete,
            state,
          )

        state =
          startRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
          )

        state =
          setRemoteManualMetric(
            athlete,
            state,
            'remote-item-1',
            'complete_reps',
            15,
          )

        state =
          completeRemoteTestItem(
            athlete,
            state,
            'remote-item-1',
          )

        state =
          skipRemoteTestItem(
            athlete,
            state,
            'remote-item-2',
          )

        expect(
          remoteTestProgress(
            state,
          ),
        ).toEqual({
          total: 2,
          completed: 1,
          skipped: 1,
          closed: 2,
          percent: 100,
        })

        state =
          finishRemoteTestSession(
            athlete,
            state,
            '2026-12-13T09:30:00.000Z',
          )

        expect(
          state.session.status,
        ).toBe(
          'completed',
        )

        expect(
          state.session.endedAt,
        ).toBe(
          '2026-12-13T09:30:00.000Z',
        )
      },
    )

    it(
      'allows the coach to cancel an unfinished assignment',
      () => {
        const state =
          cancelRemoteTestAssignment(
            coach,
            assignment(),
            '2026-12-09T12:00:00.000Z',
          )

        expect(
          state.session.status,
        ).toBe(
          'cancelled',
        )

        expect(
          state.session.endedAt,
        ).toBe(
          '2026-12-09T12:00:00.000Z',
        )
      },
    )
  },
)
