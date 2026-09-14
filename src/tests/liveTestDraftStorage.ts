import type { LiveTestRunnerState } from './liveTestRunner'

const PREFIX = 'cc-v2:live-tindeq-draft'

type StoredLiveTestDraft = {
  version: 1
  userId: string
  athleteId: string
  runner: LiveTestRunnerState
}

function storageKey(userId: string, athleteId: string) {
  return `${PREFIX}:${userId}:${athleteId}`
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined'
      ? null
      : window.localStorage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRunner(value: unknown): LiveTestRunnerState | null {
  if (!isRecord(value) || !isRecord(value.session) || !Array.isArray(value.items)) {
    return null
  }

  if (
    typeof value.session.id !== 'string' ||
    typeof value.session.athleteId !== 'string' ||
    value.session.mode !== 'live' ||
    typeof value.phase !== 'string'
  ) {
    return null
  }

  const runner = value as unknown as LiveTestRunnerState

  if (
    runner.phase === 'acquiring' ||
    runner.phase === 'countdown' ||
    runner.phase === 'armed'
  ) {
    return {
      ...runner,
      phase: runner.activeItemId ? 'ready' : 'setup',
      countdownRemaining: 0,
    }
  }

  return runner
}

export function saveLiveTestDraft(
  userId: string,
  athleteId: string,
  runner: LiveTestRunnerState,
  storage = safeStorage(),
) {
  if (!storage) return

  const key = storageKey(userId, athleteId)

  try {
    if (runner.session.status === 'completed') {
      storage.removeItem(key)
      return
    }

    const payload: StoredLiveTestDraft = {
      version: 1,
      userId,
      athleteId,
      runner,
    }

    storage.setItem(key, JSON.stringify(payload))
  } catch {
    // Remote persistence remains available when local storage is unavailable.
  }
}

export function loadLiveTestDraft(
  userId: string,
  athleteId: string,
  storage = safeStorage(),
): LiveTestRunnerState | null {
  if (!storage) return null

  try {
    const raw = storage.getItem(storageKey(userId, athleteId))
    if (!raw) return null

    const payload = JSON.parse(raw) as unknown
    if (
      !isRecord(payload) ||
      payload.version !== 1 ||
      payload.userId !== userId ||
      payload.athleteId !== athleteId
    ) {
      return null
    }

    const runner = normalizeRunner(payload.runner)
    if (
      !runner ||
      runner.session.athleteId !== athleteId ||
      runner.session.status === 'completed'
    ) {
      storage.removeItem(storageKey(userId, athleteId))
      return null
    }

    return runner
  } catch {
    return null
  }
}
