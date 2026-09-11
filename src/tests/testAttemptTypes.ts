import type { AcquisitionResult } from '../tindeq/acquisition'
import type { TestProtocolKey } from './testCatalog'

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
  side: 'left' | 'right' | 'bilateral' | null
  grip: string
  bodyWeightKg: number | null
  config: Record<string, unknown>
  acquisition: AcquisitionResult
}
