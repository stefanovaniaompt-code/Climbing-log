import type { AppProfile } from '../onboarding/types'
import type { AcquisitionResult } from '../tindeq/acquisition'
import type { TestProtocolKey } from './testCatalog'
import type {
  AttemptSelectionState,
  TestAttemptDraft,
  TestMeasurementSource,
  TestSessionDraft,
  TestSessionItemDraft,
  TestSessionMode,
  TestSessionStatus,
  TestSide,
} from './testAttemptTypes'

type IdFactory = () => string

const randomId: IdFactory = () =>
  crypto.randomUUID()

type CreateSessionOptions = {
  id?: string
  status?: TestSessionStatus
  testedAt?: string
  bodyWeightKg?: number | null
  protocolVersion?: string
  context?: Record<string, unknown>
  startedAt?: string | null
}

export function createTestSessionDraft(
  profile: AppProfile,
  athleteId: string,
  mode: TestSessionMode,
  options: CreateSessionOptions = {},
): TestSessionDraft {
  if (!athleteId.trim()) {
    throw new Error(
      'Serve un atleta per creare la sessione test.',
    )
  }

  const startedAt =
    options.startedAt ??
    (
      mode === 'remote'
        ? null
        : new Date().toISOString()
    )

  const testedAt =
    options.testedAt ??
    (
      startedAt
        ? startedAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    )

  const defaultStatus: TestSessionStatus =
    mode === 'remote'
      ? 'assigned'
      : 'in_progress'

  return {
    id:
      options.id ??
      randomId(),

    athleteId,

    coachId:
      profile.role === 'coach'
        ? profile.userId
        : null,

    mode,

    status:
      options.status ??
      defaultStatus,

    testedAt,

    bodyWeightKg:
      options.bodyWeightKg ??
      null,

    protocolVersion:
      options.protocolVersion ??
      '1.0',

    context:
      options.context ??
      {},

    startedAt,

    endedAt: null,
  }
}

type CreateItemOptions = {
  id?: string
  protocolVersion?: string
  side?: TestSide
  grip?: string
  source?: TestMeasurementSource
  config?: Record<string, unknown>
}

export function createTestSessionItemDraft(
  session: TestSessionDraft,
  itemOrder: number,
  protocolKey: TestProtocolKey,
  options: CreateItemOptions = {},
): TestSessionItemDraft {
  if (
    !Number.isInteger(itemOrder) ||
    itemOrder < 1
  ) {
    throw new Error(
      'L ordine del test deve essere maggiore di zero.',
    )
  }

  return {
    id:
      options.id ??
      randomId(),

    testSessionId:
      session.id,

    itemOrder,

    protocolKey,

    protocolVersion:
      options.protocolVersion ??
      '1.0',

    side:
      options.side ??
      null,

    grip:
      options.grip ??
      '',

    source:
      options.source ??
      'tindeq',

    config:
      options.config ??
      {},

    status: 'pending',
  }
}

export function createAttemptPayload(
  profile: AppProfile,
  session: TestSessionDraft,
  item: TestSessionItemDraft,
  acquisition: AcquisitionResult,
  attemptNumber: number,
  idFactory: IdFactory = randomId,
): TestAttemptDraft {
  if (
    item.testSessionId !==
    session.id
  ) {
    throw new Error(
      'Il test non appartiene alla sessione indicata.',
    )
  }

  if (
    !Number.isInteger(attemptNumber) ||
    attemptNumber < 1
  ) {
    throw new Error(
      'Il numero del tentativo deve essere maggiore di zero.',
    )
  }

  return {
    ownerUserId:
      profile.userId,

    athleteId:
      session.athleteId,

    coachId:
      session.coachId,

    testSessionId:
      session.id,

    testSessionItemId:
      item.id,

    attemptId:
      idFactory(),

    acquisitionId:
      idFactory(),

    resultId:
      idFactory(),

    attemptNumber,

    protocolKey:
      item.protocolKey,

    protocolVersion:
      item.protocolVersion,

    side:
      item.side,

    grip:
      item.grip,

    bodyWeightKg:
      session.bodyWeightKg,

    config:
      { ...item.config },

    acquisition,

    measurementSource:
      'tindeq',

    isSelected:
      false,
  }
}

export function selectAttemptState(
  attempts: readonly AttemptSelectionState[],
  testSessionItemId: string,
  attemptId: string,
): AttemptSelectionState[] {
  const target =
    attempts.find(
      attempt =>
        attempt.id === attemptId &&
        attempt.testSessionItemId ===
          testSessionItemId,
    )

  if (!target) {
    throw new Error(
      'Tentativo non trovato nel test selezionato.',
    )
  }

  if (
    target.qualityStatus ===
    'INVALID'
  ) {
    throw new Error(
      'Un tentativo non valido non puo essere selezionato.',
    )
  }

  return attempts.map(attempt => {
    if (
      attempt.testSessionItemId !==
      testSessionItemId
    ) {
      return { ...attempt }
    }

    return {
      ...attempt,
      isSelected:
        attempt.id === attemptId,
    }
  })
}
