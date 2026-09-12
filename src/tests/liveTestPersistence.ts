import type {
  AppProfile,
} from '../onboarding/types'

import {
  selectTestAttempt,
  syncTestAttempt,
  syncTestSession,
  syncTestSessionItem,
} from './testAttemptRepository'

import type {
  LiveTestAttemptRecord,
  LiveTestRunnerState,
} from './liveTestRunner'

export function findLiveAttemptRecord(
  state: LiveTestRunnerState,
  itemId: string,
  attemptId: string,
): LiveTestAttemptRecord {
  const item =
    state.items.find(
      entry =>
        entry.item.id ===
        itemId,
    )

  if (!item) {
    throw new Error(
      'Live test item not found.',
    )
  }

  const record =
    item.attempts.find(
      entry =>
        entry.attempt
          .attemptId ===
        attemptId,
    )

  if (!record) {
    throw new Error(
      'Live test attempt not found.',
    )
  }

  return record
}

export async function persistLiveRunnerState(
  profile: AppProfile,
  state: LiveTestRunnerState,
) {
  await syncTestSession(
    profile,
    state.session,
  )

  for (
    const entry
    of state.items
  ) {
    await syncTestSessionItem(
      profile,
      entry.item,
    )
  }

  return state
}

export async function persistLiveAttemptRecord(
  profile: AppProfile,
  state: LiveTestRunnerState,
  itemId: string,
  attemptId: string,
) {
  const record =
    findLiveAttemptRecord(
      state,
      itemId,
      attemptId,
    )

  await persistLiveRunnerState(
    profile,
    state,
  )

  await syncTestAttempt(
    profile,
    record.attempt,
  )

  return record
}

export async function persistOfficialLiveAttempt(
  profile: AppProfile,
  state: LiveTestRunnerState,
  itemId: string,
  attemptId: string,
) {
  const record =
    await persistLiveAttemptRecord(
      profile,
      state,
      itemId,
      attemptId,
    )

  await selectTestAttempt(
    profile,
    record.canonical,
  )

  return record
}

export async function flushLiveTestSession(
  profile: AppProfile,
  state: LiveTestRunnerState,
) {
  await persistLiveRunnerState(
    profile,
    state,
  )

  for (
    const entry
    of state.items
  ) {
    for (
      const record
      of entry.attempts
    ) {
      await syncTestAttempt(
        profile,
        record.attempt,
      )
    }
  }

  return state
}
