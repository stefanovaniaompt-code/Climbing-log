import type {
  AppProfile,
} from '../onboarding/types'

import {
  getTestDefinition,
  type TestProtocolKey,
} from './testCatalog'

import {
  createTestSessionDraft,
  createTestSessionItemDraft,
} from './testAttemptDomain'

import type {
  TestSessionDraft,
  TestSessionItemDraft,
  TestSide,
} from './testAttemptTypes'

export type RemoteManualValue = {
  metricKey: string
  metricLabel: string
  value: number
  unit: string
}

export type RemoteTestItem = {
  item: TestSessionItemDraft
  values: RemoteManualValue[]
  notes: string
  completedAt: string | null
}

export type RemoteTestAssignmentState = {
  session: TestSessionDraft
  items: RemoteTestItem[]
  activeItemId: string | null
}

export type CreateRemoteAssignmentOptions = {
  sessionId?: string
  testedAt?: string
  bodyWeightKg?: number | null
  protocolVersion?: string
  context?: Record<string, unknown>
}

export type AddRemoteTestItemOptions = {
  itemId?: string
  protocolVersion?: string
  side?: TestSide
  grip?: string
  config?: Record<string, unknown>
}

function assertCoach(
  profile: AppProfile,
) {
  if (
    profile.role !== 'coach' ||
    !profile.capabilities
      .canAccessCoachArea
  ) {
    throw new Error(
      'Only a coach can manage a remote test assignment.',
    )
  }
}

function assertRemoteSession(
  state: RemoteTestAssignmentState,
) {
  if (
    state.session.mode !==
    'remote'
  ) {
    throw new Error(
      'This is not a remote test session.',
    )
  }
}

function assertAthleteExecutor(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
) {
  assertRemoteSession(state)

  if (
    profile.role !== 'athlete' ||
    !profile.capabilities
      .canAccessAthleteArea ||
    !profile.athleteId ||
    profile.athleteId !==
      state.session.athleteId
  ) {
    throw new Error(
      'This remote test is assigned to another athlete.',
    )
  }
}

function findItem(
  state: RemoteTestAssignmentState,
  itemId: string,
) {
  const target =
    state.items.find(
      entry =>
        entry.item.id ===
        itemId,
    )

  if (!target) {
    throw new Error(
      'Remote test item not found.',
    )
  }

  return target
}

function replaceItem(
  state: RemoteTestAssignmentState,
  updated: RemoteTestItem,
): RemoteTestAssignmentState {
  return {
    ...state,

    items:
      state.items.map(
        entry =>
          entry.item.id ===
          updated.item.id
            ? updated
            : entry,
      ),
  }
}

export function createRemoteTestAssignment(
  profile: AppProfile,
  athleteId: string,
  options:
    CreateRemoteAssignmentOptions = {},
): RemoteTestAssignmentState {
  assertCoach(profile)

  const session =
    createTestSessionDraft(
      profile,
      athleteId,
      'remote',
      {
        id:
          options.sessionId,

        testedAt:
          options.testedAt,

        bodyWeightKg:
          options.bodyWeightKg,

        protocolVersion:
          options.protocolVersion,

        context:
          options.context,

        status:
          'assigned',

        startedAt:
          null,
      },
    )

  return {
    session,
    items: [],
    activeItemId: null,
  }
}

export function addRemoteTestItem(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  protocolKey: TestProtocolKey,
  options:
    AddRemoteTestItemOptions = {},
): RemoteTestAssignmentState {
  assertCoach(profile)
  assertRemoteSession(state)

  if (
    state.session.coachId !==
    profile.userId
  ) {
    throw new Error(
      'This remote assignment belongs to another coach.',
    )
  }

  if (
    state.session.status !==
    'assigned'
  ) {
    throw new Error(
      'Remote tests cannot be changed after the athlete has started.',
    )
  }

  const definition =
    getTestDefinition(
      protocolKey,
    )

  if (!definition) {
    throw new Error(
      'Unknown test protocol.',
    )
  }

  /*
   * Remote testing is deliberately MANUAL ONLY.
   *
   * Tindeq belongs to coach-led live testing.
   */
  if (
    !definition.sources.includes(
      'manual',
    )
  ) {
    throw new Error(
      'This test requires live instrumentation and cannot be assigned remotely.',
    )
  }

  if (
    !definition.sideApplicable &&
    options.side !== undefined &&
    options.side !== null
  ) {
    throw new Error(
      'This protocol does not use a side.',
    )
  }

  if (
    !definition.gripApplicable &&
    options.grip?.trim()
  ) {
    throw new Error(
      'This protocol does not use a grip.',
    )
  }

  const item =
    createTestSessionItemDraft(
      state.session,
      state.items.length + 1,
      protocolKey,
      {
        id:
          options.itemId,

        protocolVersion:
          options.protocolVersion ??
          definition.version,

        side:
          definition.sideApplicable
            ? options.side ?? null
            : null,

        grip:
          definition.gripApplicable
            ? options.grip ?? ''
            : '',

        source:
          'manual',

        config: {
          primaryMetricKey:
            definition.primaryMetricKey,

          ...(options.config ?? {}),
        },
      },
    )

  return {
    ...state,

    items: [
      ...state.items,
      {
        item,
        values: [],
        notes: '',
        completedAt: null,
      },
    ],
  }
}

export function removeRemoteTestItem(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  itemId: string,
): RemoteTestAssignmentState {
  assertCoach(profile)
  assertRemoteSession(state)

  if (
    state.session.coachId !==
    profile.userId
  ) {
    throw new Error(
      'This remote assignment belongs to another coach.',
    )
  }

  if (
    state.session.status !==
    'assigned'
  ) {
    throw new Error(
      'Remote tests cannot be changed after the athlete has started.',
    )
  }

  if (
    !state.items.some(
      entry =>
        entry.item.id ===
        itemId,
    )
  ) {
    throw new Error(
      'Remote test item not found.',
    )
  }

  const remaining =
    state.items
      .filter(
        entry =>
          entry.item.id !==
          itemId,
      )
      .map(
        (entry, index) => ({
          ...entry,

          item: {
            ...entry.item,

            itemOrder:
              index + 1,
          },
        }),
      )

  return {
    ...state,
    items: remaining,
  }
}

export function startRemoteTestSession(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  startedAt =
    new Date().toISOString(),
): RemoteTestAssignmentState {
  assertAthleteExecutor(
    profile,
    state,
  )

  if (
    state.session.status !==
    'assigned'
  ) {
    throw new Error(
      'Remote test session is not waiting to be started.',
    )
  }

  if (!state.items.length) {
    throw new Error(
      'Remote test assignment has no tests.',
    )
  }

  return {
    ...state,

    session: {
      ...state.session,

      status:
        'in_progress',

      startedAt,

      testedAt:
        startedAt.slice(
          0,
          10,
        ),
    },
  }
}

export function startRemoteTestItem(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  itemId: string,
): RemoteTestAssignmentState {
  assertAthleteExecutor(
    profile,
    state,
  )

  if (
    state.session.status !==
    'in_progress'
  ) {
    throw new Error(
      'Start the remote session before starting a test.',
    )
  }

  if (
    state.activeItemId &&
    state.activeItemId !==
      itemId
  ) {
    throw new Error(
      'Another remote test is already active.',
    )
  }

  const target =
    findItem(
      state,
      itemId,
    )

  if (
    target.item.status ===
      'completed' ||
    target.item.status ===
      'skipped'
  ) {
    throw new Error(
      'This remote test item is already closed.',
    )
  }

  const next =
    target.item.status ===
      'in_progress'
      ? state
      : replaceItem(
          state,
          {
            ...target,

            item: {
              ...target.item,

              status:
                'in_progress',
            },
          },
        )

  return {
    ...next,

    activeItemId:
      itemId,
  }
}

export function setRemoteManualMetric(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  itemId: string,
  metricKey: string,
  value: number,
): RemoteTestAssignmentState {
  assertAthleteExecutor(
    profile,
    state,
  )

  if (
    state.session.status !==
    'in_progress'
  ) {
    throw new Error(
      'Remote session is not in progress.',
    )
  }

  const target =
    findItem(
      state,
      itemId,
    )

  if (
    target.item.status ===
      'completed' ||
    target.item.status ===
      'skipped'
  ) {
    throw new Error(
      'A closed remote test cannot be edited.',
    )
  }

  if (!Number.isFinite(value)) {
    throw new Error(
      'Remote test value must be a finite number.',
    )
  }

  const definition =
    getTestDefinition(
      target.item.protocolKey,
    )

  const metric =
    definition?.metrics.find(
      candidate =>
        candidate.key ===
        metricKey,
    )

  if (!metric) {
    throw new Error(
      'Metric is not defined for this remote test.',
    )
  }

  const updatedValue:
    RemoteManualValue = {
      metricKey:
        metric.key,

      metricLabel:
        metric.label,

      value,

      unit:
        metric.unit,
    }

  const values =
    target.values.some(
      current =>
        current.metricKey ===
        metricKey,
    )
      ? target.values.map(
          current =>
            current.metricKey ===
            metricKey
              ? updatedValue
              : current,
        )
      : [
          ...target.values,
          updatedValue,
        ]

  return replaceItem(
    state,
    {
      ...target,

      item: {
        ...target.item,

        status:
          target.item.status ===
            'pending'
            ? 'in_progress'
            : target.item.status,
      },

      values,
    },
  )
}

export function clearRemoteManualMetric(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  itemId: string,
  metricKey: string,
): RemoteTestAssignmentState {
  assertAthleteExecutor(
    profile,
    state,
  )

  const target =
    findItem(
      state,
      itemId,
    )

  if (
    target.item.status ===
      'completed' ||
    target.item.status ===
      'skipped'
  ) {
    throw new Error(
      'A closed remote test cannot be edited.',
    )
  }

  return replaceItem(
    state,
    {
      ...target,

      values:
        target.values.filter(
          value =>
            value.metricKey !==
            metricKey,
        ),
    },
  )
}

export function setRemoteTestNotes(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  itemId: string,
  notes: string,
): RemoteTestAssignmentState {
  assertAthleteExecutor(
    profile,
    state,
  )

  const target =
    findItem(
      state,
      itemId,
    )

  return replaceItem(
    state,
    {
      ...target,
      notes,
    },
  )
}

export function completeRemoteTestItem(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  itemId: string,
  completedAt =
    new Date().toISOString(),
): RemoteTestAssignmentState {
  assertAthleteExecutor(
    profile,
    state,
  )

  if (
    state.activeItemId !==
    itemId
  ) {
    throw new Error(
      'This remote test item is not active.',
    )
  }

  const target =
    findItem(
      state,
      itemId,
    )

  if (
    target.item.status !==
    'in_progress'
  ) {
    throw new Error(
      'Remote test item is not in progress.',
    )
  }

  /*
   * The checkmark means "I actually performed this
   * test and entered at least one measured value".
   */
  if (!target.values.length) {
    throw new Error(
      'Enter the test result before marking it as completed.',
    )
  }

  const next =
    replaceItem(
      state,
      {
        ...target,

        completedAt,

        item: {
          ...target.item,

          status:
            'completed',
        },
      },
    )

  return {
    ...next,

    activeItemId:
      null,
  }
}

export function skipRemoteTestItem(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  itemId: string,
): RemoteTestAssignmentState {
  assertAthleteExecutor(
    profile,
    state,
  )

  if (
    state.session.status !==
    'in_progress'
  ) {
    throw new Error(
      'Remote session is not in progress.',
    )
  }

  if (
    state.activeItemId &&
    state.activeItemId !==
      itemId
  ) {
    throw new Error(
      'Another remote test is active.',
    )
  }

  const target =
    findItem(
      state,
      itemId,
    )

  if (
    target.item.status ===
      'completed' ||
    target.item.status ===
      'skipped'
  ) {
    throw new Error(
      'Remote test item is already closed.',
    )
  }

  const next =
    replaceItem(
      state,
      {
        ...target,

        item: {
          ...target.item,

          status:
            'skipped',
        },
      },
    )

  return {
    ...next,

    activeItemId:
      null,
  }
}

export function saveRemoteTestDraft(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
): RemoteTestAssignmentState {
  assertAthleteExecutor(
    profile,
    state,
  )

  if (
    state.session.status !==
    'in_progress'
  ) {
    throw new Error(
      'Only an in-progress remote session can be saved as draft.',
    )
  }

  /*
   * Values and item statuses are persisted.
   * activeItemId is only transient UI state.
   */
  return {
    ...state,

    activeItemId:
      null,
  }
}

export function finishRemoteTestSession(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  endedAt =
    new Date().toISOString(),
): RemoteTestAssignmentState {
  assertAthleteExecutor(
    profile,
    state,
  )

  if (
    state.session.status !==
    'in_progress'
  ) {
    throw new Error(
      'Remote session is not in progress.',
    )
  }

  if (state.activeItemId) {
    throw new Error(
      'Close the active remote test first.',
    )
  }

  const unfinished =
    state.items.some(
      entry =>
        entry.item.status !==
          'completed' &&
        entry.item.status !==
          'skipped',
    )

  if (unfinished) {
    throw new Error(
      'All remote tests must be completed or skipped.',
    )
  }

  return {
    ...state,

    session: {
      ...state.session,

      status:
        'completed',

      endedAt,
    },
  }
}

export function cancelRemoteTestAssignment(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
  endedAt =
    new Date().toISOString(),
): RemoteTestAssignmentState {
  assertCoach(profile)
  assertRemoteSession(state)

  if (
    state.session.coachId !==
    profile.userId
  ) {
    throw new Error(
      'This remote assignment belongs to another coach.',
    )
  }

  if (
    state.session.status ===
      'completed' ||
    state.session.status ===
      'cancelled'
  ) {
    throw new Error(
      'This remote assignment is already closed.',
    )
  }

  return {
    ...state,

    activeItemId:
      null,

    session: {
      ...state.session,

      status:
        'cancelled',

      endedAt,
    },
  }
}

export function remoteTestProgress(
  state: RemoteTestAssignmentState,
) {
  const total =
    state.items.length

  const completed =
    state.items.filter(
      entry =>
        entry.item.status ===
        'completed',
    ).length

  const skipped =
    state.items.filter(
      entry =>
        entry.item.status ===
        'skipped',
    ).length

  const closed =
    completed + skipped

  return {
    total,
    completed,
    skipped,
    closed,

    percent:
      total
        ? closed /
            total *
            100
        : 0,
  }
}
