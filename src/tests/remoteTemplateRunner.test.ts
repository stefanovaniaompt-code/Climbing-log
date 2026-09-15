import { describe, expect, it } from 'vitest'
import type { AppProfile } from '../onboarding/types'
import {
  addRemoteTestItem,
  completeRemoteTestItem,
  createRemoteTestAssignment,
  setRemoteManualMetric,
  startRemoteTestItem,
  startRemoteTestSession,
} from './remoteTestRunner'
import { REMOTE_TEMPLATE_BLUEPRINTS, type RemoteTestTemplate } from './remoteTestTemplates'

const coach: AppProfile = {
  userId: 'coach-1', displayName: 'Monica', role: 'coach', athleteId: null,
  capabilities: { canAccessCoachArea: true, canAccessAthleteArea: false },
  workspaceId: 'workspace', workspaceName: 'Workspace', onboardingCompletedAt: '2026-01-01T00:00:00.000Z', mustChangePassword: false,
}

const athlete: AppProfile = {
  userId: 'athlete-user', displayName: 'Atleta', role: 'athlete', athleteId: 'athlete-1',
  capabilities: { canAccessCoachArea: false, canAccessAthleteArea: true },
  workspaceId: 'workspace', workspaceName: 'Workspace', onboardingCompletedAt: '2026-01-01T00:00:00.000Z', mustChangePassword: false,
}

function template(key: string): RemoteTestTemplate {
  return {
    ...REMOTE_TEMPLATE_BLUEPRINTS.find(candidate => candidate.protocolKey === key)!,
    id: `library-${key}`,
    coachId: coach.userId,
    videoUrl: `https://video.example/${key}`,
  }
}

describe('remote template runner', () => {
  it('snapshots the selected output schema and keeps the library relation', () => {
    const peak = template('remote_peak_force_open_hand')
    let state = createRemoteTestAssignment(coach, 'athlete-1')
    state = addRemoteTestItem(coach, state, peak.protocolKey, {
      itemId: 'peak-item', template: peak, beam: 'low', laterality: 'right_left',
    })

    expect(state.items[0].item).toMatchObject({
      testLibraryId: peak.id,
      source: 'manual',
      grip: '',
      config: {
        beam: 'low', laterality: 'right_left',
        outputSchema: [
          { key: 'right', unit: 'kg' },
          { key: 'left', unit: 'kg' },
        ],
      },
    })
  })

  it('requires both right and left values before completion', () => {
    const peak = template('remote_peak_force_half_crimp')
    let state = createRemoteTestAssignment(coach, 'athlete-1')
    state = addRemoteTestItem(coach, state, peak.protocolKey, {
      itemId: 'peak-item', template: peak, beam: 'high', laterality: 'right_left',
    })
    state = startRemoteTestSession(athlete, state)
    state = startRemoteTestItem(athlete, state, 'peak-item')
    state = setRemoteManualMetric(athlete, state, 'peak-item', 'right', 32.5)

    expect(() => completeRemoteTestItem(athlete, state, 'peak-item')).toThrow('tutti i risultati richiesti')

    state = setRemoteManualMetric(athlete, state, 'peak-item', 'left', 30)
    expect(completeRemoteTestItem(athlete, state, 'peak-item').items[0].item.status).toBe('completed')
  })

  it('rejects negative values and decimal repetitions', () => {
    const pullups = template('remote_pullup_max')
    let state = createRemoteTestAssignment(coach, 'athlete-1')
    state = addRemoteTestItem(coach, state, pullups.protocolKey, { itemId: 'pullups', template: pullups })
    state = startRemoteTestSession(athlete, state)
    state = startRemoteTestItem(athlete, state, 'pullups')

    expect(() => setRemoteManualMetric(athlete, state, 'pullups', 'repetitions', -1)).toThrow('negativo')
    expect(() => setRemoteManualMetric(athlete, state, 'pullups', 'repetitions', 4.5)).toThrow('intero')
  })
})
