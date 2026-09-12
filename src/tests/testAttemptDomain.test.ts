import {
  describe,
  expect,
  it,
} from 'vitest'

import type { AppProfile } from '../onboarding/types'
import type { AcquisitionResult } from '../tindeq/acquisition'

import {
  createAttemptPayload,
  createTestSessionDraft,
  createTestSessionItemDraft,
  selectAttemptState,
} from './testAttemptDomain'

import type {
  AttemptSelectionState,
} from './testAttemptTypes'

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

const acquisition: AcquisitionResult = {
  samples: Object.freeze([]),

  startedAt:
    '2026-09-12T08:00:00.000Z',

  endedAt:
    '2026-09-12T08:00:05.000Z',

  deviceInfo: {
    id: 'tindeq-1',
    name: 'Tindeq Progressor',
  },

  qualityStatus: 'VALID',

  qualityFlags: [],

  primaryMetricKey:
    'peak_n',

  primaryValue:
    480,

  primaryUnit:
    'N',

  secondaryMetrics: {
    peak_n: 480,
    rfd_200: 1200,
  },

  samplingMetadata: {
    sampleCount: 500,
    durationSeconds: 5,
    estimatedHz: 100,
    maximumGapMs: 12,
  },
}

describe(
  'test attempt domain',
  () => {
    it(
      'creates live and remote sessions explicitly',
      () => {
        const live =
          createTestSessionDraft(
            profile,
            'athlete-1',
            'live',
            {
              id: 'session-live',
            },
          )

        const remote =
          createTestSessionDraft(
            profile,
            'athlete-1',
            'remote',
            {
              id: 'session-remote',
            },
          )

        expect(live.mode)
          .toBe('live')

        expect(live.status)
          .toBe('in_progress')

        expect(remote.mode)
          .toBe('remote')

        expect(remote.status)
          .toBe('assigned')

        expect(live.coachId)
          .toBe('coach-1')

        expect(remote.coachId)
          .toBe('coach-1')
      },
    )

    it(
      'allows multiple items inside the same session',
      () => {
        const session =
          createTestSessionDraft(
            profile,
            'athlete-1',
            'live',
            {
              id: 'session-1',
            },
          )

        const right =
          createTestSessionItemDraft(
            session,
            1,
            'peak_force',
            {
              id: 'item-right',
              side: 'right',
              grip: '20 mm',
            },
          )

        const left =
          createTestSessionItemDraft(
            session,
            2,
            'peak_force',
            {
              id: 'item-left',
              side: 'left',
              grip: '20 mm',
            },
          )

        expect(right.testSessionId)
          .toBe(session.id)

        expect(left.testSessionId)
          .toBe(session.id)

        expect(right.id)
          .not.toBe(left.id)

        expect(right.itemOrder)
          .toBe(1)

        expect(left.itemOrder)
          .toBe(2)
      },
    )

    it(
      'creates several attempts without changing session or item',
      () => {
        const session =
          createTestSessionDraft(
            profile,
            'athlete-1',
            'live',
            {
              id: 'session-1',
              bodyWeightKg: 70,
            },
          )

        const item =
          createTestSessionItemDraft(
            session,
            1,
            'peak_force',
            {
              id: 'item-1',
              protocolVersion: '2.0',
              side: 'right',
              grip: '20 mm half crimp',
              config: {
                edgeMm: 20,
                posture: 'seated',
              },
            },
          )

        let id = 0

        const ids = () =>
          `generated-${++id}`

        const attempt1 =
          createAttemptPayload(
            profile,
            session,
            item,
            acquisition,
            1,
            ids,
          )

        const attempt2 =
          createAttemptPayload(
            profile,
            session,
            item,
            acquisition,
            2,
            ids,
          )

        const attempt3 =
          createAttemptPayload(
            profile,
            session,
            item,
            acquisition,
            3,
            ids,
          )

        expect(
          new Set([
            attempt1.testSessionId,
            attempt2.testSessionId,
            attempt3.testSessionId,
          ]),
        ).toEqual(
          new Set(['session-1']),
        )

        expect(
          new Set([
            attempt1.testSessionItemId,
            attempt2.testSessionItemId,
            attempt3.testSessionItemId,
          ]),
        ).toEqual(
          new Set(['item-1']),
        )

        expect([
          attempt1.attemptNumber,
          attempt2.attemptNumber,
          attempt3.attemptNumber,
        ]).toEqual([
          1,
          2,
          3,
        ])
      },
    )

    it(
      'keeps protocol setup side grip and body weight in the attempt',
      () => {
        const session =
          createTestSessionDraft(
            profile,
            'athlete-1',
            'live',
            {
              id: 'session-1',
              bodyWeightKg: 72,
            },
          )

        const item =
          createTestSessionItemDraft(
            session,
            1,
            'rfd',
            {
              id: 'item-1',
              protocolVersion: '3.1',
              side: 'left',
              grip: '20 mm open hand',
              config: {
                edgeMm: 20,
                rfdWindowMs: 200,
              },
            },
          )

        let id = 0

        const attempt =
          createAttemptPayload(
            profile,
            session,
            item,
            acquisition,
            1,
            () => `id-${++id}`,
          )

        expect(attempt.protocolKey)
          .toBe('rfd')

        expect(attempt.protocolVersion)
          .toBe('3.1')

        expect(attempt.side)
          .toBe('left')

        expect(attempt.grip)
          .toBe('20 mm open hand')

        expect(attempt.bodyWeightKg)
          .toBe(72)

        expect(attempt.config)
          .toEqual({
            edgeMm: 20,
            rfdWindowMs: 200,
          })

        expect(attempt.acquisition)
          .toBe(acquisition)

        expect(attempt.isSelected)
          .toBe(false)

        expect(attempt.measurementSource)
          .toBe('tindeq')
      },
    )

    it(
      'selects only one attempt inside an item',
      () => {
        const attempts:
          AttemptSelectionState[] = [
            {
              id: 'a1',
              testSessionItemId: 'item-1',
              qualityStatus: 'VALID',
              isSelected: true,
            },
            {
              id: 'a2',
              testSessionItemId: 'item-1',
              qualityStatus: 'VALID',
              isSelected: false,
            },
            {
              id: 'a3',
              testSessionItemId: 'item-1',
              qualityStatus: 'REVIEW',
              isSelected: false,
            },
          ]

        const selected =
          selectAttemptState(
            attempts,
            'item-1',
            'a2',
          )

        expect(
          selected.find(
            attempt =>
              attempt.id === 'a1',
          )?.isSelected,
        ).toBe(false)

        expect(
          selected.find(
            attempt =>
              attempt.id === 'a2',
          )?.isSelected,
        ).toBe(true)

        expect(
          selected.filter(
            attempt =>
              attempt.isSelected,
          ),
        ).toHaveLength(1)
      },
    )

    it(
      'does not modify attempts belonging to another item',
      () => {
        const attempts:
          AttemptSelectionState[] = [
            {
              id: 'a1',
              testSessionItemId: 'item-1',
              qualityStatus: 'VALID',
              isSelected: true,
            },
            {
              id: 'a2',
              testSessionItemId: 'item-1',
              qualityStatus: 'VALID',
              isSelected: false,
            },
            {
              id: 'b1',
              testSessionItemId: 'item-2',
              qualityStatus: 'VALID',
              isSelected: true,
            },
          ]

        const selected =
          selectAttemptState(
            attempts,
            'item-1',
            'a2',
          )

        expect(
          selected.find(
            attempt =>
              attempt.id === 'b1',
          )?.isSelected,
        ).toBe(true)
      },
    )

    it(
      'rejects selection of an invalid attempt',
      () => {
        const attempts:
          AttemptSelectionState[] = [
            {
              id: 'invalid',
              testSessionItemId: 'item-1',
              qualityStatus: 'INVALID',
              isSelected: false,
            },
          ]

        expect(
          () =>
            selectAttemptState(
              attempts,
              'item-1',
              'invalid',
            ),
        ).toThrow(
          'Un tentativo non valido non può essere selezionato.',
        )
      },
    )

    it(
      'keeps manual items compatible with the same session model',
      () => {
        const session =
          createTestSessionDraft(
            profile,
            'athlete-1',
            'manual',
            {
              id: 'manual-session',
            },
          )

        const item =
          createTestSessionItemDraft(
            session,
            1,
            'pullup_1rm',
            {
              id: 'manual-item',
              source: 'manual',
            },
          )

        expect(session.mode)
          .toBe('manual')

        expect(item.source)
          .toBe('manual')

        expect(item.testSessionId)
          .toBe(
            'manual-session',
          )
      },
    )
  },
)
