import type { AppProfile } from '../onboarding/types'
import type { AcquisitionResult } from '../tindeq/acquisition'
import {
  getTestDefinition,
  type TestProtocolKey,
} from './testCatalog'
import {
  buildCanonicalTestResults,
  type CanonicalTestResultBundle,
} from './testCanonicalResults'
import {
  createAttemptPayload,
  createTestSessionDraft,
  createTestSessionItemDraft,
} from './testAttemptDomain'
import type {
  TestAttemptDraft,
  TestSessionDraft,
  TestSessionItemDraft,
  TestSide,
} from './testAttemptTypes'

export type LiveTestRunnerPhase =
  | 'setup'
  | 'ready'
  | 'countdown'
  | 'armed'
  | 'acquiring'
  | 'review'
  | 'completed'

export type LiveTestAttemptRecord = {
  attempt: TestAttemptDraft
  canonical: CanonicalTestResultBundle
}

export type LiveTestRunnerItem = {
  item: TestSessionItemDraft
  attempts: LiveTestAttemptRecord[]
  selectedAttemptId: string | null
}

export type LiveTestRunnerState = {
  session: TestSessionDraft
  items: LiveTestRunnerItem[]
  activeItemId: string | null
  phase: LiveTestRunnerPhase
  countdownRemaining: number
}

type IdFactory = () => string

export type CreateLiveRunnerOptions = {
  sessionId?: string
  testedAt?: string
  bodyWeightKg?: number | null
}

export type AddLiveTestItemOptions = {
  itemId?: string
  protocolVersion?: string
  side?: TestSide
  grip?: string
  config?: Record<string, unknown>
}

function currentItem(
  state: LiveTestRunnerState,
) {
  if (!state.activeItemId) return null

  return (
    state.items.find(
      entry =>
        entry.item.id ===
        state.activeItemId,
    ) ??
    null
  )
}

function replaceItem(
  state: LiveTestRunnerState,
  updated: LiveTestRunnerItem,
): LiveTestRunnerState {
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

export function createLiveTestRunner(
  profile: AppProfile,
  athleteId: string,
  options: CreateLiveRunnerOptions = {},
): LiveTestRunnerState {
  const session =
    createTestSessionDraft(
      profile,
      athleteId,
      'live',
      {
        id:
          options.sessionId,

        testedAt:
          options.testedAt,

        bodyWeightKg:
          options.bodyWeightKg,
      },
    )

  return {
    session,
    items: [],
    activeItemId: null,
    phase: 'setup',
    countdownRemaining: 0,
  }
}

export function addLiveTestItem(
  state: LiveTestRunnerState,
  protocolKey: TestProtocolKey,
  options: AddLiveTestItemOptions = {},
): LiveTestRunnerState {
  if (
    state.phase === 'completed' ||
    state.session.status === 'completed'
  ) {
    throw new Error(
      'Completed test sessions cannot be modified.',
    )
  }

  const definition =
    getTestDefinition(protocolKey)

  if (
    !definition ||
    !definition.sources.includes('tindeq')
  ) {
    throw new Error(
      'This protocol is not available for Tindeq.',
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
          'tindeq',

        config:
          options.config ?? {},
      },
    )

  return {
    ...state,
    items: [
      ...state.items,
      {
        item,
        attempts: [],
        selectedAttemptId: null,
      },
    ],
  }
}

export function activateLiveTestItem(
  state: LiveTestRunnerState,
  itemId: string,
): LiveTestRunnerState {
  if (
    state.phase !== 'setup'
  ) {
    throw new Error(
      'Another live-test action is already active.',
    )
  }

  const target =
    state.items.find(
      entry =>
        entry.item.id === itemId,
    )

  if (!target) {
    throw new Error(
      'Test item not found.',
    )
  }

  if (
    target.item.status === 'completed' ||
    target.item.status === 'skipped'
  ) {
    throw new Error(
      'This test item is already closed.',
    )
  }

  const updated: LiveTestRunnerItem = {
    ...target,
    item: {
      ...target.item,
      status: 'in_progress',
    },
  }

  return {
    ...replaceItem(
      state,
      updated,
    ),
    activeItemId: itemId,
    phase: 'ready',
    countdownRemaining: 0,
  }
}

export function beginLiveCountdown(
  state: LiveTestRunnerState,
  seconds = 3,
): LiveTestRunnerState {
  if (
    state.phase !== 'ready' ||
    !currentItem(state)
  ) {
    throw new Error(
      'A test item must be ready before countdown.',
    )
  }

  if (
    !Number.isInteger(seconds) ||
    seconds < 0
  ) {
    throw new Error(
      'Countdown must be zero or a positive integer.',
    )
  }

  if (seconds === 0) {
    return {
      ...state,
      phase: 'armed',
      countdownRemaining: 0,
    }
  }

  return {
    ...state,
    phase: 'countdown',
    countdownRemaining: seconds,
  }
}

export function advanceLiveCountdown(
  state: LiveTestRunnerState,
): LiveTestRunnerState {
  if (
    state.phase !== 'countdown'
  ) {
    throw new Error(
      'Countdown is not active.',
    )
  }

  if (
    state.countdownRemaining <= 1
  ) {
    return {
      ...state,
      phase: 'armed',
      countdownRemaining: 0,
    }
  }

  return {
    ...state,
    countdownRemaining:
      state.countdownRemaining - 1,
  }
}

export function markLiveAcquisitionStarted(
  state: LiveTestRunnerState,
): LiveTestRunnerState {
  if (
    state.phase !== 'armed' ||
    !currentItem(state)
  ) {
    throw new Error(
      'The runner is not armed.',
    )
  }

  return {
    ...state,
    phase: 'acquiring',
  }
}

export function recordLiveAcquisition(
  state: LiveTestRunnerState,
  profile: AppProfile,
  acquisition: AcquisitionResult,
  idFactory?: IdFactory,
): LiveTestRunnerState {
  if (
    state.phase !== 'acquiring'
  ) {
    throw new Error(
      'No acquisition is active.',
    )
  }

  const active =
    currentItem(state)

  if (!active) {
    throw new Error(
      'No active test item.',
    )
  }

  const attemptNumber =
    active.attempts.length + 1

  const attempt =
    createAttemptPayload(
      profile,
      state.session,
      active.item,
      acquisition,
      attemptNumber,
      idFactory,
    )

  const canonical =
    buildCanonicalTestResults(
      state.session,
      active.item,
      attempt.attemptId,
      acquisition,
    )

  const updated: LiveTestRunnerItem = {
    ...active,
    attempts: [
      ...active.attempts,
      {
        attempt,
        canonical,
      },
    ],
  }

  return {
    ...replaceItem(
      state,
      updated,
    ),
    phase: 'review',
    countdownRemaining: 0,
  }
}

export function selectLiveTestAttempt(
  state: LiveTestRunnerState,
  attemptId: string,
): LiveTestRunnerState {
  const active =
    currentItem(state)

  if (
    state.phase !== 'review' ||
    !active
  ) {
    throw new Error(
      'An attempt must be reviewed before selection.',
    )
  }

  const target =
    active.attempts.find(
      entry =>
        entry.attempt.attemptId ===
        attemptId,
    )

  if (!target) {
    throw new Error(
      'Attempt not found in the active test.',
    )
  }

  if (
    target.attempt.acquisition
      .qualityStatus === 'INVALID'
  ) {
    throw new Error(
      'Invalid attempts cannot be selected.',
    )
  }

  return replaceItem(
    state,
    {
      ...active,
      selectedAttemptId:
        attemptId,
    },
  )
}

export function prepareNextLiveAttempt(
  state: LiveTestRunnerState,
): LiveTestRunnerState {
  if (
    state.phase !== 'review' ||
    !currentItem(state)
  ) {
    throw new Error(
      'There is no reviewed attempt to retry.',
    )
  }

  return {
    ...state,
    phase: 'ready',
    countdownRemaining: 0,
  }
}

export function completeActiveLiveTestItem(
  state: LiveTestRunnerState,
): LiveTestRunnerState {
  if (
    state.phase !== 'review'
  ) {
    throw new Error(
      'The active test is not ready to close.',
    )
  }

  const active =
    currentItem(state)

  if (!active) {
    throw new Error(
      'No active test item.',
    )
  }

  if (
    !active.selectedAttemptId
  ) {
    throw new Error(
      'Select an official attempt before closing the test.',
    )
  }

  const updated: LiveTestRunnerItem = {
    ...active,
    item: {
      ...active.item,
      status: 'completed',
    },
  }

  return {
    ...replaceItem(
      state,
      updated,
    ),
    activeItemId: null,
    phase: 'setup',
    countdownRemaining: 0,
  }
}

export function skipActiveLiveTestItem(
  state: LiveTestRunnerState,
): LiveTestRunnerState {
  const active =
    currentItem(state)

  if (!active) {
    throw new Error(
      'No active test item.',
    )
  }

  if (
    state.phase === 'acquiring' ||
    state.phase === 'countdown'
  ) {
    throw new Error(
      'An active acquisition cannot be skipped.',
    )
  }

  const updated: LiveTestRunnerItem = {
    ...active,
    item: {
      ...active.item,
      status: 'skipped',
    },
  }

  return {
    ...replaceItem(
      state,
      updated,
    ),
    activeItemId: null,
    phase: 'setup',
    countdownRemaining: 0,
  }
}

export function selectedLiveAttempt(
  state: LiveTestRunnerState,
  itemId: string,
) {
  const target =
    state.items.find(
      entry =>
        entry.item.id === itemId,
    )

  if (
    !target ||
    !target.selectedAttemptId
  ) {
    return null
  }

  return (
    target.attempts.find(
      entry =>
        entry.attempt.attemptId ===
        target.selectedAttemptId,
    ) ??
    null
  )
}

export function finishLiveTestSession(
  state: LiveTestRunnerState,
  endedAt = new Date().toISOString(),
): LiveTestRunnerState {
  if (
    state.phase !== 'setup' ||
    state.activeItemId
  ) {
    throw new Error(
      'Close the active test before finishing the session.',
    )
  }

  if (!state.items.length) {
    throw new Error(
      'A live session needs at least one test.',
    )
  }

  const unfinished =
    state.items.some(
      entry =>
        entry.item.status !== 'completed' &&
        entry.item.status !== 'skipped',
    )

  if (unfinished) {
    throw new Error(
      'All test items must be completed or skipped.',
    )
  }

  return {
    ...state,
    session: {
      ...state.session,
      status: 'completed',
      endedAt,
    },
    phase: 'completed',
    countdownRemaining: 0,
  }
}
