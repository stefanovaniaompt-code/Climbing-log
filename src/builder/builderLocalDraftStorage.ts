export const BUILDER_LOCAL_DRAFT_VERSION = 1 as const
export const BUILDER_LOCAL_DRAFT_PREFIX = `cc-v2:builder-pending:v${BUILDER_LOCAL_DRAFT_VERSION}`
export const BUILDER_LOCAL_DRAFT_ERROR = 'La modifica non è protetta sul dispositivo: lo spazio locale non è disponibile.'
export const BUILDER_LOCAL_DRAFT_UNRECONCILED = 'Questa entità contiene una bozza locale non ancora recuperata. Recupera prima la bozza locale per poterla modificare.'

export type BuilderDraftEntityType = 'week' | 'session' | 'exercise'

export type BuilderDraftIdentity = {
  userId: string
  programId: string
  entityType: BuilderDraftEntityType
  entityId: string
}

export type StoredBuilderLocalDraft = BuilderDraftIdentity & {
  version: typeof BUILDER_LOCAL_DRAFT_VERSION
  generationId?: string
  revision: number
  updatedAt: string
  remoteBase: {
    fingerprint: string
    fields: Record<string, unknown>
  }
  changes: Record<string, unknown>
}

export type BuilderLocalDraftWriteResult =
  | { ok: true; draft: StoredBuilderLocalDraft | null }
  | { ok: false; reason: 'storage-unavailable' | 'unreconciled-draft'; error: string }

export type BuilderLocalDraftClearResult =
  | { ok: true; cleared: boolean }
  | { ok: false; error: string }

export type BuilderLocalDraftClaimResult =
  | { ok: true; claimed: true; draft: StoredBuilderLocalDraft & { generationId: string } }
  | { ok: true; claimed: false }
  | { ok: false; error: string }

export type BuilderLocalDraftScanIssue = {
  key: string
  code: 'corrupt' | 'incompatible-version' | 'invalid-format' | 'storage-unavailable'
  identity?: BuilderDraftIdentity
  message: string
}

export type BuilderLocalDraftScanResult = {
  ok: boolean
  drafts: StoredBuilderLocalDraft[]
  issues: BuilderLocalDraftScanIssue[]
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function valuesMatch(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => valuesMatch(value, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && valuesMatch(left[key], right[key]))
}

function fingerprint(value: object) {
  const serialized = JSON.stringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function changedFields(remoteBase: object, current: object, pendingRemote: object | null = null) {
  const baseRecord = remoteBase as Record<string, unknown>
  const currentRecord = current as Record<string, unknown>
  const pendingRecord = pendingRemote as Record<string, unknown> | null
  const changes: Record<string, unknown> = {}
  const baseFields: Record<string, unknown> = {}

  for (const key of Object.keys(currentRecord)) {
    if (valuesMatch(baseRecord[key], currentRecord[key])) continue
    changes[key] = cloneValue(currentRecord[key])
    baseFields[key] = cloneValue(baseRecord[key])
  }

  if (pendingRecord) {
    for (const key of Object.keys(currentRecord)) {
      if (Object.prototype.hasOwnProperty.call(changes, key) || valuesMatch(pendingRecord[key], currentRecord[key])) continue
      changes[key] = cloneValue(currentRecord[key])
      baseFields[key] = cloneValue(baseRecord[key])
    }
  }

  return { changes, baseFields }
}

let fallbackGenerationSequence = 0

function createGenerationId(now: number) {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  } catch { /* Usa il fallback locale se crypto non è disponibile. */ }
  fallbackGenerationSequence += 1
  return `draft-${now.toString(36)}-${fallbackGenerationSequence.toString(36)}-${Math.random().toString(36).slice(2)}`
}

function validDraft(value: unknown, identity?: BuilderDraftIdentity): value is StoredBuilderLocalDraft {
  if (!isRecord(value) || !isRecord(value.remoteBase) || !isRecord(value.remoteBase.fields) || !isRecord(value.changes)) return false
  if (
    value.version !== BUILDER_LOCAL_DRAFT_VERSION ||
    typeof value.userId !== 'string' ||
    typeof value.programId !== 'string' ||
    (value.entityType !== 'week' && value.entityType !== 'session' && value.entityType !== 'exercise') ||
    typeof value.entityId !== 'string' ||
    (value.generationId !== undefined && (typeof value.generationId !== 'string' || !value.generationId)) ||
    typeof value.revision !== 'number' ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.updatedAt !== 'string' ||
    typeof value.remoteBase.fingerprint !== 'string'
  ) return false

  return !identity || (
    value.userId === identity.userId &&
    value.programId === identity.programId &&
    value.entityType === identity.entityType &&
    value.entityId === identity.entityId
  )
}

export function builderLocalDraftKey(identity: BuilderDraftIdentity) {
  return [
    BUILDER_LOCAL_DRAFT_PREFIX,
    encodeURIComponent(identity.userId),
    encodeURIComponent(identity.programId),
    identity.entityType,
    encodeURIComponent(identity.entityId),
  ].join(':')
}

export function readBuilderLocalDraft(identity: BuilderDraftIdentity, storage: Storage | null = browserStorage()) {
  if (!storage) return null
  try {
    const raw = storage.getItem(builderLocalDraftKey(identity))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return validDraft(parsed, identity) ? parsed : null
  } catch {
    return null
  }
}

function identityFromDraftKey(key: string): BuilderDraftIdentity | null {
  const prefix = `${BUILDER_LOCAL_DRAFT_PREFIX}:`
  if (!key.startsWith(prefix)) return null
  const parts = key.slice(prefix.length).split(':')
  if (parts.length !== 4 || (parts[2] !== 'week' && parts[2] !== 'session' && parts[2] !== 'exercise')) return null
  try {
    return {
      userId: decodeURIComponent(parts[0]),
      programId: decodeURIComponent(parts[1]),
      entityType: parts[2],
      entityId: decodeURIComponent(parts[3]),
    }
  } catch {
    return null
  }
}

export function scanBuilderLocalDrafts(userId: string, storage: Storage | null = browserStorage()): BuilderLocalDraftScanResult {
  if (!storage) return {
    ok: false,
    drafts: [],
    issues: [{ key: '', code: 'storage-unavailable', message: 'Le bozze locali non possono essere verificate: lo spazio locale non è disponibile.' }],
  }
  const drafts: StoredBuilderLocalDraft[] = []
  const issues: BuilderLocalDraftScanIssue[] = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key?.startsWith(`${BUILDER_LOCAL_DRAFT_PREFIX}:`)) continue
      const identity = identityFromDraftKey(key)
      if (!identity || identity.userId !== userId) continue
      const raw = storage.getItem(key)
      if (!raw) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(raw) as unknown
      } catch {
        issues.push({ key, code: 'corrupt', identity, message: 'La bozza locale contiene JSON non leggibile.' })
        continue
      }
      if (isRecord(parsed) && parsed.version !== BUILDER_LOCAL_DRAFT_VERSION) {
        issues.push({ key, code: 'incompatible-version', identity, message: 'La bozza locale usa una versione non compatibile.' })
        continue
      }
      if (!validDraft(parsed, identity)) {
        issues.push({ key, code: 'invalid-format', identity, message: 'La bozza locale è incompleta o non valida.' })
        continue
      }
      drafts.push(parsed)
    }
  } catch {
    return {
      ok: false,
      drafts,
      issues: [...issues, { key: '', code: 'storage-unavailable', message: 'Le bozze locali non possono essere verificate: lo spazio locale non è disponibile.' }],
    }
  }
  drafts.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
  issues.sort((left, right) => left.key.localeCompare(right.key))
  return { ok: true, drafts, issues }
}

export function listBuilderLocalDrafts(userId: string, storage: Storage | null = browserStorage()) {
  return scanBuilderLocalDrafts(userId, storage).drafts
}

export function writeBuilderLocalDraft(
  identity: BuilderDraftIdentity,
  remoteBase: object,
  current: object,
  storage: Storage | null = browserStorage(),
  now = Date.now(),
  expectedRevision: number | null = null,
  options: { expectedGenerationId?: string | null; pendingRemote?: object | null } = {},
): BuilderLocalDraftWriteResult {
  if (!storage) return { ok: false, reason: 'storage-unavailable', error: BUILDER_LOCAL_DRAFT_ERROR }
  const key = builderLocalDraftKey(identity)
  try {
    const previousRaw = storage.getItem(key)
    let previousValue: unknown = null
    try { previousValue = previousRaw ? JSON.parse(previousRaw) as unknown : null } catch { /* Una voce illeggibile deve essere protetta, non sostituita. */ }
    const previous = validDraft(previousValue, identity) ? previousValue : null
    const expectedGenerationId = options.expectedGenerationId ?? null
    const ownsPreviousRevision = previousRaw === null
      ? expectedRevision === null && expectedGenerationId === null
      : previous !== null
        && previous.generationId !== undefined
        && previous.revision === expectedRevision
        && previous.generationId === expectedGenerationId
    if (!ownsPreviousRevision) return { ok: false, reason: 'unreconciled-draft', error: BUILDER_LOCAL_DRAFT_UNRECONCILED }

    const { changes, baseFields } = changedFields(remoteBase, current, options.pendingRemote ?? null)
    if (Object.keys(changes).length === 0) {
      storage.removeItem(key)
      return { ok: true, draft: null }
    }

    const draft: StoredBuilderLocalDraft = {
      version: BUILDER_LOCAL_DRAFT_VERSION,
      ...identity,
      generationId: previous?.generationId ?? createGenerationId(now),
      revision: (previous?.revision ?? 0) + 1,
      updatedAt: new Date(now).toISOString(),
      remoteBase: {
        fingerprint: fingerprint(remoteBase),
        fields: baseFields,
      },
      changes,
    }
    storage.setItem(key, JSON.stringify(draft))
    return { ok: true, draft }
  } catch {
    return { ok: false, reason: 'storage-unavailable', error: BUILDER_LOCAL_DRAFT_ERROR }
  }
}

export function clearBuilderLocalDraftRevision(
  identity: BuilderDraftIdentity,
  revision: number,
  storage: Storage | null = browserStorage(),
  expectedGenerationId: string | null = null,
): BuilderLocalDraftClearResult {
  if (!storage) return { ok: false, error: BUILDER_LOCAL_DRAFT_ERROR }
  try {
    const key = builderLocalDraftKey(identity)
    const raw = storage.getItem(key)
    if (!raw) return { ok: true, cleared: false }
    const parsed = JSON.parse(raw) as unknown
    const current = validDraft(parsed, identity) ? parsed : null
    if (
      !current
      || current.revision !== revision
      || (current.generationId === undefined ? expectedGenerationId !== null : current.generationId !== expectedGenerationId)
    ) return { ok: true, cleared: false }
    storage.removeItem(key)
    return { ok: true, cleared: true }
  } catch {
    return { ok: false, error: BUILDER_LOCAL_DRAFT_ERROR }
  }
}

export function claimBuilderLocalDraftRevision(
  identity: BuilderDraftIdentity,
  revision: number,
  expectedGenerationId: string | null,
  storage: Storage | null = browserStorage(),
  now = Date.now(),
): BuilderLocalDraftClaimResult {
  if (!storage) return { ok: false, error: BUILDER_LOCAL_DRAFT_ERROR }
  try {
    const key = builderLocalDraftKey(identity)
    const raw = storage.getItem(key)
    if (!raw) return { ok: true, claimed: false }
    const parsed = JSON.parse(raw) as unknown
    const current = validDraft(parsed, identity) ? parsed : null
    if (
      !current
      || current.revision !== revision
      || (current.generationId === undefined ? expectedGenerationId !== null : current.generationId !== expectedGenerationId)
    ) return { ok: true, claimed: false }

    if (current.generationId) return { ok: true, claimed: true, draft: current as StoredBuilderLocalDraft & { generationId: string } }

    const claimedDraft: StoredBuilderLocalDraft & { generationId: string } = {
      ...current,
      generationId: createGenerationId(now),
    }
    storage.setItem(key, JSON.stringify(claimedDraft))
    return { ok: true, claimed: true, draft: claimedDraft }
  } catch {
    return { ok: false, error: BUILDER_LOCAL_DRAFT_ERROR }
  }
}
