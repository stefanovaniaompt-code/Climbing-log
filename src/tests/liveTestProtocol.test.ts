import { describe, expect, it } from 'vitest'
import type { AppProfile } from '../onboarding/types'
import type { AcquisitionResult } from '../tindeq/acquisition'
import {
  activateLiveTestItem,
  addLiveTestItem,
  beginLiveCountdown,
  completeActiveLiveTestItem,
  createLiveTestRunner,
  markLiveAcquisitionStarted,
  recordLiveAcquisition,
  selectLiveTestAttempt,
} from './liveTestRunner'

const profile: AppProfile = {
  userId: 'coach-1', displayName: 'Monica', role: 'coach', athleteId: null,
  capabilities: { canAccessCoachArea: true, canAccessAthleteArea: false },
  workspaceId: 'workspace-1', workspaceName: 'Workspace', onboardingCompletedAt: '2026-01-01T00:00:00.000Z', mustChangePassword: false,
}

const mvcResult: AcquisitionResult = {
  samples: Object.freeze([]), startedAt: '2026-09-15T10:00:00.000Z', endedAt: '2026-09-15T10:00:02.000Z',
  deviceInfo: null, qualityStatus: 'VALID', qualityFlags: [], primaryMetricKey: 'mvc_kg', primaryValue: 40, primaryUnit: 'kg',
  secondaryMetrics: { mvc_kg: 40, peak_n: 392.266 }, samplingMetadata: { sampleCount: 100, durationSeconds: 2, estimatedHz: 50, maximumGapMs: 20 },
}

function completedMvc() {
  let state = createLiveTestRunner(profile, 'athlete-1', { sessionId: 'session-1' })
  state = addLiveTestItem(state, 'live_mvc_half_crimp', { itemId: 'mvc-right', side: 'right', grip: 'half_crimp' })
  state = activateLiveTestItem(state, 'mvc-right')
  state = beginLiveCountdown(state, 0)
  state = markLiveAcquisitionStarted(state)
  state = recordLiveAcquisition(state, profile, mvcResult, () => 'attempt-1')
  state = selectLiveTestAttempt(state, 'attempt-1')
  state = completeActiveLiveTestItem(state)
  return state
}

describe('live clinical protocol dependencies', () => {
  it('takes MVC only from the same session, grip and side and snapshots a 60 percent target', () => {
    let state = completedMvc()
    state = addLiveTestItem(state, 'live_endurance_half_crimp', { itemId: 'endurance-right', side: 'right', grip: 'half_crimp' })
    state = activateLiveTestItem(state, 'endurance-right')
    const item = state.items.find(entry => entry.item.id === 'endurance-right')!.item
    expect(item.config.mvcUsedKg).toBe(40)
    expect(item.config.targetKg).toBe(24)
    expect(item.config.targetTolerancePercent).toBe(0.05)
    expect(item.config.mvcSourceItemId).toBe('mvc-right')
  })

  it('blocks a target test when MVC exists only for the other side', () => {
    let state = completedMvc()
    state = addLiveTestItem(state, 'live_endurance_half_crimp', { itemId: 'endurance-left', side: 'left', grip: 'half_crimp' })
    expect(() => activateLiveTestItem(state, 'endurance-left')).toThrow(/Completa prima Peak Force/)
  })
})
