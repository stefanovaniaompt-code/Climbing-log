import { describe, expect, it } from 'vitest'
import { exerciseSyncItemId, isRetryableNetworkError, processExerciseSyncItems, processTestAttemptItems, testAttemptItemId, type ExerciseSyncOutboxItem, type TestAttemptOutboxItem } from './outbox'

describe('exercise outbox', () => {
  it('deduplica una modifica per utente, sessione ed esercizio', () => {
    const identity = { ownerUserId: 'user-1', sessionLogId: 'log-1', sessionExerciseId: 'exercise-1' }
    expect(exerciseSyncItemId(identity)).toBe(exerciseSyncItemId(identity))
    expect(exerciseSyncItemId(identity)).not.toBe(exerciseSyncItemId({ ...identity, sessionExerciseId: 'exercise-2' }))
  })

  it('accoda solo errori compatibili con un guasto di rete', () => {
    expect(isRetryableNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isRetryableNetworkError({ status: 0 })).toBe(true)
    expect(isRetryableNetworkError({ code: '42501', message: 'row-level security violation' })).toBe(false)
  })

  it('rimuove solo elementi confermati e si ferma al primo errore', async () => {
    const makeItem = (id: string): ExerciseSyncOutboxItem => ({
      id,
      kind: 'exercise.completed.v1',
      createdAt: '2026-09-06T10:00:00Z',
      attempts: 0,
      payload: { ownerUserId: 'user-1', sessionLogId: 'log-1', sessionExerciseId: id, actual: {}, rpe: null, notes: '', completedAt: '2026-09-06T10:00:00Z' },
    })
    const removed: string[] = []
    const failed: string[] = []
    const sent: string[] = []
    const result = await processExerciseSyncItems(
      [makeItem('first'), makeItem('second'), makeItem('third')],
      async payload => {
        sent.push(payload.sessionExerciseId)
        if (payload.sessionExerciseId === 'second') throw new Error('offline')
      },
      async id => { removed.push(id) },
      async item => { failed.push(item.id) },
    )
    expect(result).toEqual({ synced: 1, failed: 1 })
    expect(sent).toEqual(['first', 'second'])
    expect(removed).toEqual(['first'])
    expect(failed).toEqual(['second'])
  })

  it('deduplica e ritenta una acquisizione senza creare doppioni', async () => {
    const payload = { ownerUserId: 'coach-1', acquisitionId: 'acquisition-1' }
    expect(testAttemptItemId(payload)).toBe(testAttemptItemId(payload))
    const item = { id: testAttemptItemId(payload), kind: 'test.attempt.v1', payload: { ...payload } as TestAttemptOutboxItem['payload'], createdAt: '2026-09-09T08:00:00Z', attempts: 0 } as TestAttemptOutboxItem
    const sent: string[] = []
    const result = await processTestAttemptItems([item], async value => { sent.push(value.acquisitionId) }, async () => undefined, async () => undefined)
    expect(result).toEqual({ synced: 1, failed: 0 })
    expect(sent).toEqual(['acquisition-1'])
  })
})
