import type { AppProfile } from '../onboarding/types'
import {
  TindeqAcquisition,
  type AcquisitionConfig,
  type AcquisitionResult,
} from '../tindeq/acquisition'
import type {
  DeviceConnectionState,
  MeasurementDevice,
  MeasurementDeviceInfo,
} from '../tindeq/device'
import { MockTindeqDevice } from '../tindeq/mock'
import type { TindeqForceSample } from '../tindeq/protocol'
import type { TestProtocolKey } from './testCatalog'
import {
  activateLiveTestItem,
  addLiveTestItem,
  advanceLiveCountdown,
  beginLiveCountdown,
  completeActiveLiveTestItem,
  createLiveTestRunner,
  finishLiveTestSession,
  markLiveAcquisitionStarted,
  prepareNextLiveAttempt,
  recordLiveAcquisition,
  selectLiveTestAttempt,
  type AddLiveTestItemOptions,
  type CreateLiveRunnerOptions,
  type LiveTestRunnerState,
} from './liveTestRunner'
import type {
  TestSessionDraft,
  TestSessionItemDraft,
} from './testAttemptTypes'

type IdFactory = () => string

export type LiveForceSnapshot = {
  sampleCount: number
  currentForceN: number | null
  peakForceN: number | null
}

export type LiveTestRuntimeSnapshot = {
  runner: LiveTestRunnerState
  connectionState: DeviceConnectionState
  deviceInfo: MeasurementDeviceInfo | null
  force: LiveForceSnapshot
}

export type LiveTestRuntimeListener = (
  snapshot: LiveTestRuntimeSnapshot,
) => void

function finiteNumber(
  value: unknown,
): number | undefined {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  )
    ? value
    : undefined
}

function criticalForceIntervals(
  value: unknown,
): AcquisitionConfig['criticalForceIntervals'] {
  if (!Array.isArray(value)) return undefined

  const parsed =
    value.flatMap(entry => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry)
      ) {
        return []
      }

      const record =
        entry as Record<string, unknown>

      const durationSeconds =
        finiteNumber(
          record.durationSeconds,
        )

      const workJoules =
        finiteNumber(
          record.workJoules,
        )

      if (
        durationSeconds === undefined ||
        workJoules === undefined
      ) {
        return []
      }

      return [{
        durationSeconds,
        workJoules,
      }]
    })

  return parsed.length
    ? parsed
    : undefined
}

export function buildLiveAcquisitionConfig(
  session: TestSessionDraft,
  item: TestSessionItemDraft,
): AcquisitionConfig {
  if (
    item.testSessionId !==
    session.id
  ) {
    throw new Error(
      'Test item and session do not match.',
    )
  }

  return {
    protocolKey:
      item.protocolKey,

    protocolVersion:
      item.protocolVersion,

    bodyWeightKg:
      session.bodyWeightKg,

    targetN:
      finiteNumber(
        item.config.targetN,
      ),

    rfdWindowMs:
      finiteNumber(
        item.config.rfdWindowMs,
      ),

    side:
      item.side,

    grip:
      item.grip,

    criticalForceIntervals:
      criticalForceIntervals(
        item.config
          .criticalForceIntervals,
      ),
  }
}

function emptyForceSnapshot():
  LiveForceSnapshot {
  return {
    sampleCount: 0,
    currentForceN: null,
    peakForceN: null,
  }
}

export class LiveTestRuntime {
  private runnerState:
    LiveTestRunnerState

  private acquisition:
    TindeqAcquisition | null =
      null

  private forceState:
    LiveForceSnapshot =
      emptyForceSnapshot()

  private readonly listeners =
    new Set<
      LiveTestRuntimeListener
    >()

  private readonly unsubscribeDevice:
    () => void

  constructor(
    private readonly profile:
      AppProfile,

    runner:
      LiveTestRunnerState,

    private readonly device:
      MeasurementDevice,

    private readonly idFactory?:
      IdFactory,
  ) {
    this.runnerState = runner

    this.unsubscribeDevice =
      this.device.subscribe(
        event => {
          if (
            event.type === 'connection' ||
            event.type === 'device-info'
          ) {
            this.publish()
          }
        },
      )
  }

  get deviceKind() {
    return this.device.kind
  }

  get snapshot():
    LiveTestRuntimeSnapshot {
    return {
      runner:
        this.runnerState,

      connectionState:
        this.device.connectionState,

      deviceInfo:
        this.device.info,

      force:
        { ...this.forceState },
    }
  }

  subscribe(
    listener:
      LiveTestRuntimeListener,
  ) {
    this.listeners.add(listener)

    listener(
      this.snapshot,
    )

    return () => {
      this.listeners.delete(
        listener,
      )
    }
  }

  private publish() {
    const snapshot =
      this.snapshot

    for (
      const listener
      of this.listeners
    ) {
      listener(snapshot)
    }
  }

  private updateRunner(
    next:
      LiveTestRunnerState,
  ) {
    this.runnerState = next
    this.publish()
  }

  addItem(
    protocolKey:
      TestProtocolKey,

    options:
      AddLiveTestItemOptions = {},
  ) {
    this.updateRunner(
      addLiveTestItem(
        this.runnerState,
        protocolKey,
        options,
      ),
    )
  }

  activateItem(
    itemId: string,
  ) {
    this.updateRunner(
      activateLiveTestItem(
        this.runnerState,
        itemId,
      ),
    )
  }

  beginCountdown(
    seconds = 3,
  ) {
    this.updateRunner(
      beginLiveCountdown(
        this.runnerState,
        seconds,
      ),
    )
  }

  advanceCountdown() {
    this.updateRunner(
      advanceLiveCountdown(
        this.runnerState,
      ),
    )
  }

  async connect() {
    const info =
      await this.device.connect()

    this.publish()

    return info
  }

  async reconnect() {
    if (this.acquisition) {
      throw new Error(
        'Stop the active acquisition before reconnecting.',
      )
    }

    const info =
      await this.device.reconnect()

    this.publish()

    return info
  }

  async disconnect() {
    if (this.acquisition) {
      throw new Error(
        'Stop the active acquisition before disconnecting.',
      )
    }

    await this.device.disconnect()
    this.publish()
  }

  async refreshDeviceInfo() {
    const info =
      await this.device
        .refreshDeviceInfo()

    this.publish()

    return info
  }

  async tare() {
    if (
      this.device.connectionState !==
      'connected'
    ) {
      throw new Error(
        'Connect the Tindeq before tare.',
      )
    }

    if (this.acquisition) {
      throw new Error(
        'Tare is not allowed during an acquisition.',
      )
    }

    await this.device.tare()
  }

  async startAcquisition() {
    if (
      this.device.connectionState !==
      'connected'
    ) {
      throw new Error(
        'Connect the Tindeq before starting a test.',
      )
    }

    if (this.acquisition) {
      throw new Error(
        'An acquisition is already active.',
      )
    }

    if (
      this.runnerState.phase !==
      'armed'
    ) {
      throw new Error(
        'The live test runner is not armed.',
      )
    }

    const active =
      this.runnerState.items.find(
        entry =>
          entry.item.id ===
          this.runnerState
            .activeItemId,
      )

    if (!active) {
      throw new Error(
        'No active test item.',
      )
    }

    const config =
      buildLiveAcquisitionConfig(
        this.runnerState.session,
        active.item,
      )

    const acquisition =
      new TindeqAcquisition(
        this.device,
        config,
      )

    const previousRunner =
      this.runnerState

    this.forceState =
      emptyForceSnapshot()

    this.runnerState =
      markLiveAcquisitionStarted(
        this.runnerState,
      )

    this.publish()

    try {
      await acquisition.start(
        samples => {
          this.consumeSamples(
            samples,
          )
        },
      )

      this.acquisition =
        acquisition
    } catch (reason) {
      this.runnerState =
        previousRunner

      this.forceState =
        emptyForceSnapshot()

      this.publish()

      throw reason
    }
  }

  private consumeSamples(
    samples:
      readonly TindeqForceSample[],
  ) {
    if (!samples.length) return

    let peak =
      this.forceState
        .peakForceN

    for (const sample of samples) {
      peak =
        peak === null
          ? sample.forceN
          : Math.max(
              peak,
              sample.forceN,
            )
    }

    this.forceState = {
      sampleCount:
        this.forceState
          .sampleCount +
        samples.length,

      currentForceN:
        samples[
          samples.length - 1
        ].forceN,

      peakForceN:
        peak,
    }

    this.publish()
  }

  async stopAcquisition():
    Promise<AcquisitionResult> {
    if (
      !this.acquisition ||
      this.runnerState.phase !==
        'acquiring'
    ) {
      throw new Error(
        'No acquisition is active.',
      )
    }

    const acquisition =
      this.acquisition

    const result =
      await acquisition.stop()

    this.acquisition = null

    this.runnerState =
      recordLiveAcquisition(
        this.runnerState,
        this.profile,
        result,
        this.idFactory,
      )

    this.publish()

    return result
  }

  selectAttempt(
    attemptId: string,
  ) {
    this.updateRunner(
      selectLiveTestAttempt(
        this.runnerState,
        attemptId,
      ),
    )
  }

  retry() {
    this.forceState =
      emptyForceSnapshot()

    this.updateRunner(
      prepareNextLiveAttempt(
        this.runnerState,
      ),
    )
  }

  completeActiveItem() {
    this.forceState =
      emptyForceSnapshot()

    this.updateRunner(
      completeActiveLiveTestItem(
        this.runnerState,
      ),
    )
  }

  finishSession(
    endedAt?:
      string,
  ) {
    this.updateRunner(
      finishLiveTestSession(
        this.runnerState,
        endedAt,
      ),
    )
  }

  dispose() {
    if (this.acquisition) {
      throw new Error(
        'Stop the active acquisition before disposing the runtime.',
      )
    }

    this.unsubscribeDevice()
    this.listeners.clear()
  }
}

export type MockLiveTestRuntimeOptions =
  CreateLiveRunnerOptions & {
    sampleHz?: number
    idFactory?: IdFactory
  }

export function createMockLiveTestRuntime(
  profile: AppProfile,
  athleteId: string,
  options:
    MockLiveTestRuntimeOptions = {},
) {
  const {
    sampleHz = 80,
    idFactory,
    ...runnerOptions
  } = options

  const runner =
    createLiveTestRunner(
      profile,
      athleteId,
      runnerOptions,
    )

  return new LiveTestRuntime(
    profile,
    runner,
    new MockTindeqDevice(
      sampleHz,
    ),
    idFactory,
  )
}
