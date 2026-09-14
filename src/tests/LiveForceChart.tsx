import type { LiveForceCurvePoint } from './liveTestRuntime'
import { buildLiveForceChart } from './liveForceChartModel'

const WIDTH = 600
const HEIGHT = 240

export function LiveForceChart({
  points,
  targetN,
  tolerancePercent = 0.1,
}: {
  points: readonly LiveForceCurvePoint[]
  targetN: number | null
  tolerancePercent?: number
}) {
  const chart = buildLiveForceChart(
    points,
    targetN,
    tolerancePercent,
    WIDTH,
    HEIGHT,
  )

  const forceToY = (forceN: number) =>
    HEIGHT -
    (forceN / chart.maxForceN) *
      HEIGHT

  const targetTop =
    chart.upperTargetN === null
      ? null
      : forceToY(chart.upperTargetN)

  const targetHeight =
    chart.lowerTargetN === null ||
    chart.upperTargetN === null
      ? null
      : forceToY(chart.lowerTargetN) -
        forceToY(chart.upperTargetN)

  return (
    <div
      className={`live-force-chart${chart.inTarget ? ' is-in-target' : ''}`}
      aria-label="Curva di forza live"
    >
      <div className="live-force-chart__labels">
        <span>{chart.maxForceN.toFixed(0)} N</span>
        {chart.targetN !== null && (
          <strong>
            Target {chart.targetN.toFixed(1)} N · zona ±{Math.round(tolerancePercent * 100)}%
          </strong>
        )}
        <span>{chart.durationSeconds.toFixed(1)} s</span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Andamento della forza nel tempo"
        preserveAspectRatio="none"
      >
        <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} />
        {targetTop !== null && targetHeight !== null && (
          <rect
            className="live-force-chart__target"
            x="0"
            y={targetTop}
            width={WIDTH}
            height={targetHeight}
          />
        )}
        {chart.polyline && (
          <polyline
            className="live-force-chart__line"
            points={chart.polyline}
          />
        )}
      </svg>
    </div>
  )
}
