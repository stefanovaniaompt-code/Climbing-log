import {
  describe,
  expect,
  it,
} from 'vitest'

import type { AppProfile } from '../onboarding/types'
import type { AcquisitionResult } from '../tindeq/acquisition'

import {
  activateLiveTestItem,
  addLiveTestItem,
  advanceLiveCountdown,
  beginLiveCountdown,
  completeActiveLiveTestItem,
  createLiveTestRunner,
  finishLiveTestSession,
  markLiveAcquisitionStarted,
  prepareNextLiveAttempt,
  recordLiveAcquisition,
  selectLiveTestAttempt,
  selectedLiveAttempt,
} from './liveTestRunner'

const profile: AppProfile = {
  userId: 'coach-1',
  displayName: 'Monica',
  role: 'coach',
  athleteId: null,
  capabilities: {
    canAccessCoachArea: true,
    canAccessAthleteArea: false,
  },
  workspaceId: 'workspace-1',
  workspaceName: 'Coach workspace',
  onboardingCompletedAt:
    '2026-01-01T10:00:00.000Z',
  mustChangePassword: false,
}

function acquisition(
  qualityStatus:
    AcquisitionResult['qualityStatus'] =
      'VALID',
): AcquisitionResult {
  return {
    samples: Object.freeze([]),

    startedAt:
      '2026-09-12T09:00:00.000Z',

    endedAt:
      '2026-09-12T09:00:05.000Z',

    deviceInfo: {
      id: 'mock-progressor',
      name: 'Tindeq simulato',
    },

    qualityStatus,

    qualityFlags: [],

    primaryMetricKey:
      'peak_nkg',

    primaryValue: 8,

    primaryUnit:
      'N/kg',

    secondaryMetrics: {
      peak_nkg: 8,
      peak_n: 480,
      rfd_200: 1200,
      time_to_peak: 420,
    },

    samplingMetadata: {
      sampleCount: 400,
      durationSeconds: 5,
      estimatedHz: 80,
      maximumGapMs: 14,
    },
  }
}

function runnerWithItem() {
  let state =
    createLiveTestRunner(
      profile,
      'athlete-1',
      {
        sessionId: 'session-1',
        testedAt: '2026-09-12',
        bodyWeightKg: 60,
      },
    )

  state =
    addLiveTestItem(
      state,
      'peak_force',
      {
        itemId: 'item-right',
        side: 'right',
        grip: '20 mm',
        config: {
          edgeMm: 20,
          posture: 'seated',
        },
      },
    )

  return state
}

function reachAcquiring() {
  let state =
    runnerWithItem()

  state =
    activateLiveTestItem(
      state,
      'item-right',
    )

  state =
    beginLiveCountdown(
      state,
      2,
    )

  state =
    advanceLiveCountdown(
      state,
    )

  state =
    advanceLiveCountdown(
      state,
    )

  return markLiveAcquisitionStarted(
    state,
  )
}

describe(
  'live Tindeq test runner',
  () => {
    it(
      'creates a live session and multiple ordered test items',
      () => {
        let state =
          runnerWithItem()

        state =
          addLiveTestItem(
            state,
            'rfd',
            {
              itemId: 'item-left',
              side: 'left',
              grip: '20 mm',
              config: {
                rfdWindowMs: 200,
              },
            },
          )

        expect(state.session.mode)
          .toBe('live')

        expect(state.session.status)
          .toBe('in_progress')

        expect(state.items)
          .toHaveLength(2)

        expect(
          state.items.map(
            entry =>
              entry.item.itemOrder,
          ),
        ).toEqual([1, 2])
      },
    )

    it(
      'moves through ready countdown armed and acquiring',
      () => {
        let state =
          runnerWithItem()

        state =
          activateLiveTestItem(
            state,
            'item-right',
          )

        expect(state.phase)
          .toBe('ready')

        state =
          beginLiveCountdown(
            state,
            2,
          )

        expect(state.phase)
          .toBe('countdown')

        expect(
          state.countdownRemaining,
        ).toBe(2)

        state =
          advanceLiveCountdown(
            state,
          )

        expect(
          state.countdownRemaining,
        ).toBe(1)

        state =
          advanceLiveCountdown(
            state,
          )

        expect(state.phase)
          .toBe('armed')

        state =
          markLiveAcquisitionStarted(
            state,
          )

        expect(state.phase)
          .toBe('acquiring')
      },
    )

    it(
      'stores repeated attempts under the same session and item',
      () => {
        let state =
          reachAcquiring()

        let id = 0
        const ids = () =>
          `id-${++id}`

        state =
          recordLiveAcquisition(
            state,
            profile,
            acquisition(),
            ids,
          )

        expect(state.phase)
          .toBe('review')

        state =
          prepareNextLiveAttempt(
            state,
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

        state =
          recordLiveAcquisition(
            state,
            profile,
            acquisition(),
            ids,
          )

        state =
          prepareNextLiveAttempt(
            state,
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

        state =
          recordLiveAcquisition(
            state,
            profile,
            acquisition(),
            ids,
          )

        const attempts =
          state.items[0].attempts

        expect(attempts)
          .toHaveLength(3)

        expect(
          attempts.map(
            entry =>
              entry.attempt.attemptNumber,
          ),
        ).toEqual([1, 2, 3])

        expect(
          new Set(
            attempts.map(
              entry =>
                entry.attempt.testSessionId,
            ),
          ),
        ).toEqual(
          new Set(['session-1']),
        )

        expect(
          new Set(
            attempts.map(
              entry =>
                entry.attempt.testSessionItemId,
            ),
          ),
        ).toEqual(
          new Set(['item-right']),
        )
      },
    )

    it(
      'can change the selected official attempt without deleting raw attempts',
      () => {
        let state =
          reachAcquiring()

        let id = 0
        const ids = () =>
          `id-${++id}`

        state =
          recordLiveAcquisition(
            state,
            profile,
            acquisition(),
            ids,
          )

        const first =
          state.items[0]
            .attempts[0]
            .attempt
            .attemptId

        state =
          selectLiveTestAttempt(
            state,
            first,
          )

        expect(
          selectedLiveAttempt(
            state,
            'item-right',
          )?.attempt.attemptId,
        ).toBe(first)

        state =
          prepareNextLiveAttempt(
            state,
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

        state =
          recordLiveAcquisition(
            state,
            profile,
            acquisition(),
            ids,
          )

        const second =
          state.items[0]
            .attempts[1]
            .attempt
            .attemptId

        state =
          selectLiveTestAttempt(
            state,
            second,
          )

        expect(
          state.items[0].attempts,
        ).toHaveLength(2)

        expect(
          selectedLiveAttempt(
            state,
            'item-right',
          )?.attempt.attemptId,
        ).toBe(second)
      },
    )

    it(
      'rejects an INVALID attempt as official result',
      () => {
        let state =
          reachAcquiring()

        let id = 0

        state =
          recordLiveAcquisition(
            state,
            profile,
            acquisition('INVALID'),
            () => `id-${++id}`,
          )

        const attemptId =
          state.items[0]
            .attempts[0]
            .attempt
            .attemptId

        expect(
          () =>
            selectLiveTestAttempt(
              state,
              attemptId,
            ),
        ).toThrow(
          'Invalid attempts cannot be selected.',
        )
      },
    )

    it(
      'closes an item only after an official attempt is selected',
      () => {
        let state =
          reachAcquiring()

        let id = 0

        state =
          recordLiveAcquisition(
            state,
            profile,
            acquisition(),
            () => `id-${++id}`,
          )

        expect(
          () =>
            completeActiveLiveTestItem(
              state,
            ),
        ).toThrow(
          'Select an official attempt before closing the test.',
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

        state =
          completeActiveLiveTestItem(
            state,
          )

        expect(
          state.items[0].item.status,
        ).toBe('completed')

        expect(state.phase)
          .toBe('setup')

        expect(state.activeItemId)
          .toBeNull()
      },
    )

    it(
      'finishes the whole testing visit only when every item is closed',
      () => {
        let state =
          reachAcquiring()

        let id = 0

        state =
          recordLiveAcquisition(
            state,
            profile,
            acquisition(),
            () => `id-${++id}`,
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

        state =
          completeActiveLiveTestItem(
            state,
          )

        state =
          finishLiveTestSession(
            state,
            '2026-09-12T09:30:00.000Z',
          )

        expect(state.phase)
          .toBe('completed')

        expect(state.session.status)
          .toBe('completed')

        expect(state.session.endedAt)
          .toBe(
            '2026-09-12T09:30:00.000Z',
          )
      },
    )
  },
)
