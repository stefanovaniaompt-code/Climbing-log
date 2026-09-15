import { forceUnits } from '../tindeq/metrics'
import type { LiveTestRunnerState } from './liveTestRunner'
import { getLiveTestTemplate, liveGripLabel } from './liveTestTemplates'
import type { TestSessionItemDraft, TestSide } from './testAttemptTypes'
import {
  LIVE_TARGET_FRACTION,
  LIVE_TARGET_TOLERANCE,
} from '../tindeq/liveClinicalConfig'

export {
  ENDURANCE_OUT_OF_RANGE_GRACE_MS,
  LIVE_TARGET_FRACTION,
  LIVE_TARGET_TOLERANCE,
  REPEATER_REST_MS,
  REPEATER_WORK_MS,
} from '../tindeq/liveClinicalConfig'

export type SessionMvc = {
  itemId: string
  grip: string
  side: Exclude<TestSide, 'bilateral' | null>
  mvcKg: number
}

export function getSessionMvc(
  state: LiveTestRunnerState,
  grip: string,
  side: TestSide,
): SessionMvc | null {
  if (side !== 'right' && side !== 'left') return null

  for (const entry of state.items) {
    const template = getLiveTestTemplate(entry.item.protocolKey)
    if (
      template?.kind !== 'mvc' ||
      entry.item.status !== 'completed' ||
      entry.item.grip !== grip ||
      entry.item.side !== side ||
      !entry.selectedAttemptId
    ) continue

    const selected = entry.attempts.find(
      record => record.attempt.attemptId === entry.selectedAttemptId,
    )
    const metric = selected?.canonical.metrics.find(value => value.metricKey === 'mvc_kg')

    if (metric && Number.isFinite(metric.value) && metric.value > 0) {
      return { itemId: entry.item.id, grip, side, mvcKg: metric.value }
    }
  }

  return null
}

export function withSessionMvcDependency(
  state: LiveTestRunnerState,
  item: TestSessionItemDraft,
) {
  const template = getLiveTestTemplate(item.protocolKey)
  if (template?.kind !== 'endurance' && template?.kind !== 'repeaters') return item

  const mvc = getSessionMvc(state, item.grip, item.side)
  if (!mvc) {
    const side = item.side === 'right' ? 'DX' : item.side === 'left' ? 'SX' : ''
    throw new Error(`Completa prima Peak Force / MVC - ${liveGripLabel(item.grip)} per il lato ${side}.`)
  }

  const targetKg = mvc.mvcKg * LIVE_TARGET_FRACTION

  return {
    ...item,
    config: {
      ...item.config,
      mvcSourceItemId: mvc.itemId,
      mvcUsedKg: mvc.mvcKg,
      targetPercent: LIVE_TARGET_FRACTION * 100,
      targetTolerancePercent: LIVE_TARGET_TOLERANCE,
      targetKg,
      targetN: forceUnits.kgfToNewtons(targetKg),
    },
  }
}
