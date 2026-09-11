import { NEWTONS_PER_KGF, type TindeqForceSample } from './protocol'

export type ForcePoint = Pick<TindeqForceSample, 'timestampMicros' | 'forceN'>
export type QualityStatus = 'VALID' | 'REVIEW' | 'INVALID'

export const forceUnits = {
  newtonsToKgf: (newtons: number) => newtons / NEWTONS_PER_KGF,
  kgfToNewtons: (kgf: number) => kgf * NEWTONS_PER_KGF,
  newtonsToPercentBodyWeight: (newtons: number, bodyWeightKg: number) => newtons / (bodyWeightKg * NEWTONS_PER_KGF) * 100,
  newtonsToNkg: (newtons: number, bodyWeightKg: number) => newtons / bodyWeightKg,
}

export function peakForce(points: ForcePoint[]) {
  if (!points.length) return { value: 0, index: -1, timestampMicros: 0 }
  let index = 0
  for (let candidate = 1; candidate < points.length; candidate += 1) if (points[candidate].forceN > points[index].forceN) index = candidate
  return { value: points[index].forceN, index, timestampMicros: points[index].timestampMicros }
}

export type OnsetOptions = { baselineDurationMs?: number; minimumForceN?: number; standardDeviations?: number; sustainedMs?: number }

export function detectOnset(points: ForcePoint[], options: OnsetOptions = {}): number | null {
  if (points.length < 2) return null
  const baselineEnd = points[0].timestampMicros + (options.baselineDurationMs ?? 500) * 1000
  const baseline = points.filter(point => point.timestampMicros <= baselineEnd)
  const values = (baseline.length >= 3 ? baseline : points.slice(0, Math.min(3, points.length))).map(point => point.forceN)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  const threshold = Math.max(options.minimumForceN ?? 20, mean + (options.standardDeviations ?? 5) * Math.sqrt(variance))
  const sustainedMicros = (options.sustainedMs ?? 50) * 1000
  for (let index = 0; index < points.length; index += 1) {
    if (points[index].forceN < threshold) continue
    let end = index
    while (end + 1 < points.length && points[end + 1].forceN >= threshold) end += 1
    if (points[end].timestampMicros - points[index].timestampMicros >= sustainedMicros) return index
  }
  return null
}

function interpolateForce(points: ForcePoint[], targetMicros: number): number | null {
  if (!points.length || targetMicros < points[0].timestampMicros || targetMicros > points.at(-1)!.timestampMicros) return null
  const exact = points.find(point => point.timestampMicros === targetMicros)
  if (exact) return exact.forceN
  const upperIndex = points.findIndex(point => point.timestampMicros > targetMicros)
  if (upperIndex <= 0) return null
  const lower = points[upperIndex - 1]
  const upper = points[upperIndex]
  const ratio = (targetMicros - lower.timestampMicros) / (upper.timestampMicros - lower.timestampMicros)
  return lower.forceN + (upper.forceN - lower.forceN) * ratio
}

export function calculateRfd(points: ForcePoint[], onsetIndex: number, windowMs: number): number | null {
  const onset = points[onsetIndex]
  if (!onset || windowMs <= 0) return null
  const endForce = interpolateForce(points.slice(onsetIndex), onset.timestampMicros + windowMs * 1000)
  return endForce === null ? null : (endForce - onset.forceN) / (windowMs / 1000)
}

export function rfdMetrics(points: ForcePoint[], options: OnsetOptions = {}, windowsMs = [50, 100, 150, 200, 250]) {
  const onsetIndex = detectOnset(points, options)
  const peak = peakForce(points)
  if (onsetIndex === null) return { onsetIndex: null, peakN: peak.value, timeToPeakMs: null, byWindow: Object.fromEntries(windowsMs.map(window => [window, null])) as Record<number, number | null> }
  return {
    onsetIndex,
    peakN: peak.value,
    timeToPeakMs: (peak.timestampMicros - points[onsetIndex].timestampMicros) / 1000,
    byWindow: Object.fromEntries(windowsMs.map(window => [window, calculateRfd(points, onsetIndex, window)])) as Record<number, number | null>,
  }
}

export function impulse(points: ForcePoint[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const seconds = (points[index].timestampMicros - points[index - 1].timestampMicros) / 1_000_000
    if (seconds > 0) total += (points[index - 1].forceN + points[index].forceN) / 2 * seconds
  }
  return total
}

export function meanForce(points: ForcePoint[]) {
  return points.length ? points.reduce((sum, point) => sum + point.forceN, 0) / points.length : 0
}

export function asymmetryPercent(left: number, right: number) {
  const maximum = Math.max(Math.abs(left), Math.abs(right))
  return maximum ? Math.abs(left - right) / maximum * 100 : 0
}

export function timeToTaskFailure(points: ForcePoint[], targetN: number, minimumPercent = 0.8, graceMs = 1000): number | null {
  if (!points.length || targetN <= 0) return null
  const threshold = targetN * minimumPercent
  let belowSince: number | null = null
  for (const point of points) {
    if (point.forceN < threshold) belowSince ??= point.timestampMicros
    else belowSince = null
    if (belowSince !== null && point.timestampMicros - belowSince >= graceMs * 1000) return (belowSince - points[0].timestampMicros) / 1_000_000
  }
  return (points.at(-1)!.timestampMicros - points[0].timestampMicros) / 1_000_000
}

export type RepeaterRep = { startMicros: number; endMicros: number; peakN: number; meanN: number; impulseNs: number; valid: boolean }

export function detectRepeaters(points: ForcePoint[], targetN: number, options: { activationPercent?: number; minimumWorkMs?: number; targetTolerancePercent?: number } = {}): RepeaterRep[] {
  const activation = targetN * (options.activationPercent ?? 0.3)
  const minimumWorkMicros = (options.minimumWorkMs ?? 1000) * 1000
  const tolerance = options.targetTolerancePercent ?? 0.15
  const reps: RepeaterRep[] = []
  let start = -1
  for (let index = 0; index <= points.length; index += 1) {
    const active = index < points.length && points[index].forceN >= activation
    if (active && start < 0) start = index
    if ((!active || index === points.length) && start >= 0) {
      const end = Math.max(start, index - 1)
      const segment = points.slice(start, end + 1)
      const duration = points[end].timestampMicros - points[start].timestampMicros
      const meanN = meanForce(segment)
      reps.push({ startMicros: points[start].timestampMicros, endMicros: points[end].timestampMicros, peakN: peakForce(segment).value, meanN, impulseNs: impulse(segment), valid: duration >= minimumWorkMicros && meanN >= targetN * (1 - tolerance) })
      start = -1
    }
  }
  return reps
}

export function fatigueSlope(points: ForcePoint[]): number | null {
  if (points.length < 2) return null
  const origin = points[0].timestampMicros
  const xs = points.map(point => (point.timestampMicros - origin) / 1_000_000)
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const yMean = meanForce(points)
  const numerator = xs.reduce((sum, x, index) => sum + (x - xMean) * (points[index].forceN - yMean), 0)
  const denominator = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0)
  return denominator ? numerator / denominator : null
}

export function criticalForce(intervals: Array<{ durationSeconds: number; workJoules: number }>) {
  const valid = intervals.filter(item => item.durationSeconds > 0 && item.workJoules >= 0)
  if (valid.length < 2) return null
  const xMean = valid.reduce((sum, item) => sum + item.durationSeconds, 0) / valid.length
  const yMean = valid.reduce((sum, item) => sum + item.workJoules, 0) / valid.length
  const denominator = valid.reduce((sum, item) => sum + (item.durationSeconds - xMean) ** 2, 0)
  if (!denominator) return null
  const cfN = valid.reduce((sum, item) => sum + (item.durationSeconds - xMean) * (item.workJoules - yMean), 0) / denominator
  return { criticalForceN: cfN, wPrimeJ: yMean - cfN * xMean }
}

export function selectBestValidAttempt<T extends { qualityStatus: QualityStatus; primaryValue: number }>(attempts: T[], higherIsBetter = true): T | null {
  return attempts.filter(attempt => attempt.qualityStatus === 'VALID').sort((left, right) => higherIsBetter ? right.primaryValue - left.primaryValue : left.primaryValue - right.primaryValue)[0] ?? null
}
