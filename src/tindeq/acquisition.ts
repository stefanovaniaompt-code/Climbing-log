import type { DeviceEventListener, MeasurementDevice, MeasurementDeviceInfo } from './device'
import { criticalForce, detectRepeaters, fatigueSlope, forceUnits, impulse, meanForce, peakForce, rfdMetrics, timeToTaskFailure, type QualityStatus } from './metrics'
import type { TindeqForceSample } from './protocol'
import type { TestProtocolKey } from '../tests/testCatalog'

export type AcquisitionConfig = {
  protocolKey: TestProtocolKey
  protocolVersion: string
  bodyWeightKg: number | null
  targetN?: number
  rfdWindowMs?: number
  side: 'left' | 'right' | 'bilateral' | null
  grip: string
  criticalForceIntervals?: Array<{ durationSeconds: number; workJoules: number }>
}

export type AcquisitionResult = {
  samples: readonly TindeqForceSample[]
  startedAt: string
  endedAt: string
  deviceInfo: MeasurementDeviceInfo | null
  qualityStatus: QualityStatus
  qualityFlags: string[]
  primaryMetricKey: string | null
  primaryValue: number | null
  primaryUnit: string | null
  secondaryMetrics: Record<string, number | null>
  samplingMetadata: { sampleCount: number; durationSeconds: number; estimatedHz: number | null; maximumGapMs: number }
}

function acquisitionMetrics(samples: readonly TindeqForceSample[], config: AcquisitionConfig) {
  const points = samples.map(sample => ({ timestampMicros: sample.timestampMicros, forceN: sample.forceN }))
  const peak = peakForce(points)
  const rfd = rfdMetrics(points)
  const duration = points.length > 1 ? (points.at(-1)!.timestampMicros - points[0].timestampMicros) / 1_000_000 : 0
  const common: Record<string, number | null> = {
    peak_n: peak.value,
    peak_kgf: forceUnits.newtonsToKgf(peak.value),
    peak_nkg: config.bodyWeightKg ? forceUnits.newtonsToNkg(peak.value, config.bodyWeightKg) : null,
    peak_percent_bw: config.bodyWeightKg ? forceUnits.newtonsToPercentBodyWeight(peak.value, config.bodyWeightKg) : null,
    rfd_50: rfd.byWindow[50] ?? null,
    rfd_100: rfd.byWindow[100] ?? null,
    rfd_150: rfd.byWindow[150] ?? null,
    rfd_200: rfd.byWindow[200] ?? null,
    rfd_250: rfd.byWindow[250] ?? null,
    time_to_peak: rfd.timeToPeakMs,
    mean_force: meanForce(points),
    impulse: impulse(points),
    duration,
    fatigue_slope: fatigueSlope(points),
  }
  if (config.protocolKey === 'rfd') return { key: 'rfd_selected', value: rfd.byWindow[config.rfdWindowMs ?? 200] ?? null, unit: 'N/s', metrics: common }
  if (config.protocolKey === 'finger_endurance_60mvc' || config.protocolKey === 'endurance') {
    const target = config.targetN ?? 0
    const ttf = timeToTaskFailure(points, target)
    return { key: 'time_to_failure', value: ttf, unit: 's', metrics: { ...common, target_force: target, time_to_failure: ttf } }
  }
  if (config.protocolKey === 'repeaters' || config.protocolKey === 'repeaters_7_3') {
    const reps = detectRepeaters(points, config.targetN ?? 0)
    const valid = reps.filter(rep => rep.valid)
    return { key: 'valid_repetitions', value: valid.length, unit: 'rep', metrics: { ...common, valid_repetitions: valid.length, total_impulse: reps.reduce((sum, rep) => sum + rep.impulseNs, 0), reps_in_target: reps.length ? valid.length / reps.length * 100 : 0 } }
  }
  if (config.protocolKey === 'critical_force') {
    const fit = criticalForce(config.criticalForceIntervals ?? [])
    return { key: 'critical_force', value: fit?.criticalForceN ?? null, unit: 'N', metrics: { ...common, critical_force: fit?.criticalForceN ?? null, w_prime: fit?.wPrimeJ ?? null } }
  }
  if (config.protocolKey === 'free_measurement' || config.protocolKey === 'workout' || config.protocolKey === 'custom_session') return { key: null, value: null, unit: null, metrics: common }
  return { key: config.bodyWeightKg ? 'peak_nkg' : 'peak_n', value: config.bodyWeightKg ? common.peak_nkg : peak.value, unit: config.bodyWeightKg ? 'N/kg' : 'N', metrics: common }
}

export class TindeqAcquisition {
  private rawSamples: TindeqForceSample[] = []
  private startedAt: string | null = null
  private running = false
  private warnings: string[] = []
  private unsubscribe: (() => void) | null = null

  constructor(private readonly device: MeasurementDevice, private readonly config: AcquisitionConfig) {}

  async start(onSamples?: (samples: readonly TindeqForceSample[]) => void) {
    if (this.running) return
    this.rawSamples = []
    this.warnings = []
    this.startedAt = new Date().toISOString()
    const listener: DeviceEventListener = event => {
      if (event.type === 'samples') {
        this.rawSamples.push(...event.samples.map(sample => ({ ...sample })))
        onSamples?.(event.samples)
      } else if (event.type === 'warning') this.warnings.push(event.code)
      else if (event.type === 'connection' && (event.state === 'error' || event.state === 'disconnected') && this.running) this.warnings.push('disconnect')
    }
    this.unsubscribe = this.device.subscribe(listener)
    this.running = true
    try { await this.device.start() } catch (reason) { this.running = false; this.unsubscribe(); this.unsubscribe = null; throw reason }
  }

  async stop(): Promise<AcquisitionResult> {
    if (!this.startedAt) throw new Error('Acquisizione non avviata.')
    if (this.running) await this.device.stop()
    this.running = false
    this.unsubscribe?.()
    this.unsubscribe = null
    const samples = this.rawSamples.map(sample => Object.freeze({ ...sample }))
    const gaps = samples.slice(1).map((sample, index) => (sample.timestampMicros - samples[index].timestampMicros) / 1000).filter(gap => gap >= 0)
    const maximumGapMs = gaps.length ? Math.max(...gaps) : 0
    if (maximumGapMs > 250) this.warnings.push('sample-gap')
    const durationSeconds = samples.length > 1 ? (samples.at(-1)!.timestampMicros - samples[0].timestampMicros) / 1_000_000 : 0
    const estimatedHz = durationSeconds > 0 ? (samples.length - 1) / durationSeconds : null
    const qualityStatus: QualityStatus = !samples.length ? 'INVALID' : this.warnings.length ? 'REVIEW' : 'VALID'
    const calculated = acquisitionMetrics(samples, this.config)
    return {
      samples: Object.freeze(samples), startedAt: this.startedAt, endedAt: new Date().toISOString(), deviceInfo: this.device.info,
      qualityStatus, qualityFlags: [...new Set(this.warnings)], primaryMetricKey: calculated.key, primaryValue: calculated.value,
      primaryUnit: calculated.unit, secondaryMetrics: calculated.metrics,
      samplingMetadata: { sampleCount: samples.length, durationSeconds, estimatedHz, maximumGapMs },
    }
  }
}

export const computeAcquisitionMetrics = acquisitionMetrics
