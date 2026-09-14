import { describe, expect, it } from 'vitest'
import type { AppProfile } from '../onboarding/types'
import { createLiveTestRunner } from './liveTestRunner'
import { loadLiveTestDraft, saveLiveTestDraft } from './liveTestDraftStorage'

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
  onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
  mustChangePassword: false,
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('live Tindeq draft storage', () => {
  it('restores provisional tests for the same coach and athlete', () => {
    const storage = memoryStorage()
    const runner = createLiveTestRunner(profile, 'athlete-1', {
      sessionId: 'session-1',
    })

    runner.phase = 'acquiring'
    runner.activeItemId = 'item-1'
    saveLiveTestDraft(profile.userId, 'athlete-1', runner, storage)

    const restored = loadLiveTestDraft(
      profile.userId,
      'athlete-1',
      storage,
    )

    expect(restored?.session.id).toBe('session-1')
    expect(restored?.phase).toBe('ready')
  })

  it('does not expose a draft to another athlete', () => {
    const storage = memoryStorage()
    const runner = createLiveTestRunner(profile, 'athlete-1')
    saveLiveTestDraft(profile.userId, 'athlete-1', runner, storage)

    expect(
      loadLiveTestDraft(profile.userId, 'athlete-2', storage),
    ).toBeNull()
  })

  it('removes a completed session draft', () => {
    const storage = memoryStorage()
    const runner = createLiveTestRunner(profile, 'athlete-1')
    saveLiveTestDraft(profile.userId, 'athlete-1', runner, storage)
    runner.session.status = 'completed'
    saveLiveTestDraft(profile.userId, 'athlete-1', runner, storage)

    expect(
      loadLiveTestDraft(profile.userId, 'athlete-1', storage),
    ).toBeNull()
  })
})
