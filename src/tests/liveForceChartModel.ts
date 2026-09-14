import type { LiveForceCurvePoint } from './liveTestRuntime'

export type LiveForceChartModel = {
  maxForceN: number
  durationSeconds: number
  lowerTargetN: number | null
  upperTargetN: number | null
  targetN: number | null
  polyline: string
  inTarget: boolean
}

export function buildLiveForceChart(
  points: readonly LiveForceCurvePoint[],
  targetN: number | null,
  tolerancePercent = 0.1,
  width = 600,
  height = 240,
): LiveForceChartModel {
  const validTarget =
    targetN !== null &&
    Number.isFinite(targetN) &&
    targetN > 0
      ? targetN
      : null

  const tolerance =
    Number.isFinite(tolerancePercent) &&
    tolerancePercent > 0
      ? tolerancePercent
      : 0.1

  const lowerTargetN =
    validTarget === null
      ? null
      : validTarget * (1 - tolerance)

  const upperTargetN =
    validTarget === null
      ? null
      : validTarget * (1 + tolerance)

  const measuredMax =
    points.reduce(
      (maximum, point) =>
        Math.max(maximum, point.forceN),
      0,
    )

  const maxForceN = Math.max(
    1,
    measuredMax * 1.12,
    (upperTargetN ?? 0) * 1.2,
  )

  const durationSeconds = Math.max(
    1,
    points.at(-1)?.elapsedSeconds ?? 0,
  )

  const polyline = points
    .map(point => {
      const x =
        (point.elapsedSeconds /
          durationSeconds) *
        width
      const y =
        height -
        (Math.max(0, point.forceN) /
          maxForceN) *
          height

      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const currentForceN =
    points.at(-1)?.forceN ?? null

  return {
    maxForceN,
    durationSeconds,
    lowerTargetN,
    upperTargetN,
    targetN: validTarget,
    polyline,
    inTarget:
      currentForceN !== null &&
      lowerTargetN !== null &&
      upperTargetN !== null &&
      currentForceN >= lowerTargetN &&
      currentForceN <= upperTargetN,
  }
}
