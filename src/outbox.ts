import type { CompletedExercisePayload } from './dataRuntime'
import type { ExerciseSyncPayload } from './session/sessionRunner'
import type { TestAttemptSyncPayload } from './tests/testAttemptTypes'

const DATABASE_NAME = 'climbing-coach-v2'
const DATABASE_VERSION = 1
const STORE_NAME = 'outbox'
export const OUTBOX_CHANGED_EVENT = 'cc:outbox-change'

type LegacyOutboxItem = {
  id: string
  kind: 'exercise.completed'
  payload: CompletedExercisePayload
  createdAt: string
  attempts: number
}

export type ExerciseSyncOutboxItem = {
  id: string
  kind: 'exercise.completed.v1'
  payload: ExerciseSyncPayload
  createdAt: string
  attempts: number
}

export type TestAttemptOutboxItem = {
  id: string
  kind: 'test.attempt.v1'
  payload: TestAttemptSyncPayload
  createdAt: string
  attempts: number
}

export type OutboxItem = LegacyOutboxItem | ExerciseSyncOutboxItem | TestAttemptOutboxItem

function notifyChange() {
  window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Impossibile aprire la coda offline'))
  })
}

async function useStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    operation(store, resolve, reject)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error ?? new Error('Operazione offline non riuscita'))
  })
}

async function getAllItems(): Promise<OutboxItem[]> {
  return useStore<OutboxItem[]>('readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result as OutboxItem[])
    request.onerror = () => reject(request.error)
  })
}

export function exerciseSyncItemId(payload: Pick<ExerciseSyncPayload, 'ownerUserId' | 'sessionLogId' | 'sessionExerciseId'>) {
  return `exercise.completed.v1:${payload.ownerUserId}:${payload.sessionLogId}:${payload.sessionExerciseId}`
}

export async function enqueueExerciseSync(payload: ExerciseSyncPayload): Promise<string> {
  const id = exerciseSyncItemId(payload)
  const item: ExerciseSyncOutboxItem = { id, kind: 'exercise.completed.v1', payload, createdAt: new Date().toISOString(), attempts: 0 }
  await useStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(item)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  notifyChange()
  return id
}

export async function listPendingExerciseSync(ownerUserId: string, sessionLogId?: string): Promise<ExerciseSyncOutboxItem[]> {
  const items = await getAllItems()
  return items
    .filter((item): item is ExerciseSyncOutboxItem => item.kind === 'exercise.completed.v1')
    .filter(item => item.payload.ownerUserId === ownerUserId && (!sessionLogId || item.payload.sessionLogId === sessionLogId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

async function removeOutboxItem(id: string) {
  await useStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function incrementAttempts(item: ExerciseSyncOutboxItem) {
  await useStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put({ ...item, attempts: item.attempts + 1 })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function incrementTestAttempts(item: TestAttemptOutboxItem) {
  await useStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put({ ...item, attempts: item.attempts + 1 })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function countPendingOperations(ownerUserId: string): Promise<number> {
  const items = await getAllItems()
  return items.filter(item => item.kind !== 'exercise.completed' && item.payload.ownerUserId === ownerUserId).length
}

export function testAttemptItemId(payload: Pick<TestAttemptSyncPayload, 'ownerUserId' | 'acquisitionId'>) {
  return `test.attempt.v1:${payload.ownerUserId}:${payload.acquisitionId}`
}

export async function enqueueTestAttempt(payload: TestAttemptSyncPayload) {
  const id = testAttemptItemId(payload)
  const item: TestAttemptOutboxItem = { id, kind: 'test.attempt.v1', payload, createdAt: new Date().toISOString(), attempts: 0 }
  await useStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(item)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  notifyChange()
  return id
}

export async function listPendingTestAttempts(ownerUserId: string) {
  return (await getAllItems())
    .filter((item): item is TestAttemptOutboxItem => item.kind === 'test.attempt.v1')
    .filter(item => item.payload.ownerUserId === ownerUserId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function processTestAttemptItems(
  items: TestAttemptOutboxItem[],
  send: (payload: TestAttemptSyncPayload) => Promise<void>,
  remove: (id: string) => Promise<void>,
  markFailed: (item: TestAttemptOutboxItem) => Promise<void>,
) {
  let synced = 0
  let failed = 0
  for (const item of items) {
    try { await send(item.payload); await remove(item.id); synced += 1 }
    catch { await markFailed(item); failed += 1; break }
  }
  return { synced, failed }
}

export async function flushTestOutbox(ownerUserId: string, send: (payload: TestAttemptSyncPayload) => Promise<void>) {
  const items = (await listPendingTestAttempts(ownerUserId)).slice(0, 5)
  const { synced, failed } = await processTestAttemptItems(items, send, removeOutboxItem, incrementTestAttempts)
  if (synced > 0 || failed > 0) notifyChange()
  return { synced, failed, remaining: await countPendingOperations(ownerUserId) }
}

export async function processExerciseSyncItems(
  items: ExerciseSyncOutboxItem[],
  send: (payload: ExerciseSyncPayload) => Promise<void>,
  remove: (id: string) => Promise<void>,
  markFailed: (item: ExerciseSyncOutboxItem) => Promise<void>,
): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0
  for (const item of items) {
    try {
      await send(item.payload)
      await remove(item.id)
      synced += 1
    } catch {
      await markFailed(item)
      failed += 1
      break
    }
  }
  return { synced, failed }
}

export async function flushExerciseOutbox(
  ownerUserId: string,
  send: (payload: ExerciseSyncPayload) => Promise<void>,
): Promise<{ synced: number; failed: number; remaining: number }> {
  const items = (await listPendingExerciseSync(ownerUserId)).slice(0, 20)
  const { synced, failed } = await processExerciseSyncItems(items, send, removeOutboxItem, incrementAttempts)
  if (synced > 0 || failed > 0) notifyChange()
  return { synced, failed, remaining: await countPendingOperations(ownerUserId) }
}

export function isRetryableNetworkError(reason: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (reason instanceof TypeError) return true
  if (!reason || typeof reason !== 'object') return false
  const candidate = reason as { status?: unknown; message?: unknown }
  if (candidate.status === 0) return true
  return typeof candidate.message === 'string' && /failed to fetch|network|load failed|connection/i.test(candidate.message)
}
