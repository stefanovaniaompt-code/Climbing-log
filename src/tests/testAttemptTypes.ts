import type { AcquisitionResult } from '../tindeq/acquisition'
import type { TestProtocolKey } from './testCatalog'

export type TestSessionMode =
  | 'manual'
  | 'remote'
  | 'live'

export type TestSessionStatus =
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type TestItemStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped'

export type TestMeasurementSource =
  | 'manual'
  | 'tindeq'

export type TestSide =
  | 'left'
  | 'right'
  | 'bilateral'
  | null

export type TestSessionDraft = {
  id: string
  athleteId: string
  coachId: string | null
  mode: TestSessionMode
  status: TestSessionStatus
  testedAt: string
  bodyWeightKg: number | null
  protocolVersion: string
  context: Record<string, unknown>
  startedAt: string | null
  endedAt: string | null
}

export type TestSessionItemDraft = {
  id: string
  testSessionId: string
  testLibraryId?: string | null
  itemOrder: number
  protocolKey: TestProtocolKey
  protocolVersion: string
  side: TestSide
  grip: string
  source: TestMeasurementSource
  config: Record<string, unknown>
  status: TestItemStatus
}

export type TestAttemptSyncPayload = {
  ownerUserId: string
  athleteId: string
  coachId: string | null
  testSessionId: string
  testSessionItemId: string
  attemptId: string
  acquisitionId: string
  resultId: string
  attemptNumber: number
  protocolKey: TestProtocolKey
  protocolVersion: string
  side: TestSide
  grip: string
  bodyWeightKg: number | null
  config: Record<string, unknown>
  acquisition: AcquisitionResult
}

export type TestAttemptDraft =
  TestAttemptSyncPayload & {
    measurementSource: 'tindeq'
    isSelected: false
  }

export type AttemptSelectionState = {
  id: string
  testSessionItemId: string
  qualityStatus: 'VALID' | 'REVIEW' | 'INVALID'
  isSelected: boolean
}
