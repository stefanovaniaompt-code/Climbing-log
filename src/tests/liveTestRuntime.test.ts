import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  AppProfile,
} from '../onboarding/types'

import type {
  DeviceConnectionState,
  DeviceEventListener,
  MeasurementDevice,
  MeasurementDeviceInfo,
} from '../tindeq/device'

import type {
  TindeqForceSample,
} from '../tindeq/protocol'

import {
  createLiveTestRunner,
} from './liveTestRunner'

import {
  buildLiveAcquisitionConfig,
  createMockLiveTestRuntime,
  LiveTestRuntime,
} from './liveTestRuntime'

import {
  createTestSessionItemDraft,
} from './testAttemptDomain'

const profile: AppProfile = {
  userId: 'coach-1',
  displayName: 'Monica',
  role: 'coach',
  athleteId: null,
  capabilities: {
    canAccessCoachArea: true,
    canAccessAthleteArea: false,
  },
  workspaceId: 'workspace-1',
  workspaceName: 'Coach workspace',
  onboardingCompletedAt:
    '2026-01-01T10:00:00.000Z',
  mustChangePassword: false,
}

const scriptedSamples:
  TindeqForceSample[] = [
    0,
    80,
    180,
    300,
    400,
    480,
  ].map(
    (forceN, index) => ({
      timestampMicros:
        index * 100_000,

      forceN,

      sourceForceKgf:
        forceN / 9.80665,

      unit: 'N' as const,
    }),
  )

class ScriptedDevice
implements MeasurementDevice {
  readonly kind =
    'mock-tindeq' as const

  connectionState:
    DeviceConnectionState =
      'disconnected'

  info:
    MeasurementDeviceInfo | null =
      null

  tareCalls = 0
  startCalls = 0
  stopCalls = 0

  private readonly listeners =
    new Set<
      DeviceEventListener
    >()

  subscribe(
    listener:
      DeviceEventListener,
  ) {
    this.listeners.add(listener)

    return () =>
      this.listeners.delete(
        listener,
      )
  }

  private emit(
    event:
      Parameters<
        DeviceEventListener
      >[0],
  ) {
    for (
      const listener
      of this.listeners
    ) {
      listener(event)
    }
  }

  async connect() {
    this.connectionState =
      'connected'

    this.info = {
      id: 'scripted',
      name:
        'Tindeq scripted',
      firmwareVersion:
        'test-1.0',
      batteryMillivolts:
        4050,
    }

    this.emit({
      type: 'connection',
      state: 'connected',
    })

    this.emit({
      type: 'device-info',
      info: this.info,
    })

    return this.info
  }

  async reconnect() {
    return this.connect()
  }

  async disconnect() {
    this.connectionState =
      'disconnected'

    this.emit({
      type: 'connection',
      state:
        'disconnected',
    })
  }

  async tare() {
    this.tareCalls += 1
  }

  async start() {
    if (
      this.connectionState !==
      'connected'
    ) {
      throw new Error(
        'Device not connected.',
      )
    }

    this.startCalls += 1

    this.emit({
      type: 'samples',
      samples:
        scriptedSamples.map(
          sample => ({
            ...sample,
          }),
        ),

      receivedAt:
        '2026-09-12T09:00:00.000Z',

      sequence:
        this.startCalls,
    })
  }

  async stop() {
    this.stopCalls += 1
  }

  async refreshDeviceInfo() {
    if (!this.info) {
      throw new Error(
        'Device not connected.',
      )
    }

    return this.info
  }
}

function configuredRuntime(
  idFactory?:
    () => string,
) {
  const runner =
    createLiveTestRunner(
      profile,
      'athlete-1',
      {
        sessionId:
          'session-1',

        testedAt:
          '2026-09-12',

        bodyWeightKg:
          60,
      },
    )

  const device =
    new ScriptedDevice()

  const runtime =
    new LiveTestRuntime(
      profile,
      runner,
      device,
      idFactory,
    )

  runtime.addItem(
    'peak_force',
    {
      itemId:
        'item-right',

      side:
        'right',

      grip:
        '20 mm',

      config: {
        edgeMm: 20,
        posture: 'seated',
      },
    },
  )

  return {
    runtime,
    device,
  }
}

async function armRuntime(
  runtime:
    LiveTestRuntime,
) {
  await runtime.connect()

  runtime.activateItem(
    'item-right',
  )

  runtime.beginCountdown(0)
}

describe(
  'live Tindeq runtime',
  () => {
    it(
      'connects and exposes device information',
      async () => {
        const {
          runtime,
        } =
          configuredRuntime()

        await runtime.connect()

        expect(
          runtime.snapshot
            .connectionState,
        ).toBe('connected')

        expect(
          runtime.snapshot
            .deviceInfo,
        ).toMatchObject({
          id: 'scripted',
          name:
            'Tindeq scripted',
          batteryMillivolts:
            4050,
        })

        runtime.dispose()
      },
    )

    it(
      'requires a connection before tare',
      async () => {
        const {
          runtime,
        } =
          configuredRuntime()

        await expect(
          runtime.tare(),
        ).rejects.toThrow(
          'Connect the Tindeq before tare.',
        )

        runtime.dispose()
      },
    )

    it(
      'supports tare before acquisition',
      async () => {
        const {
          runtime,
          device,
        } =
          configuredRuntime()

        await runtime.connect()
        await runtime.tare()

        expect(
          device.tareCalls,
        ).toBe(1)

        runtime.dispose()
      },
    )

    it(
      'streams force and peak while acquiring',
      async () => {
        const {
          runtime,
        } =
          configuredRuntime()

        await armRuntime(
          runtime,
        )

        await runtime
          .startAcquisition()

        expect(
          runtime.snapshot
            .runner.phase,
        ).toBe('acquiring')

        expect(
          runtime.snapshot
            .force,
        ).toEqual({
          sampleCount:
            scriptedSamples.length,

          currentForceN:
            480,

          peakForceN:
            480,
        })

        await runtime
          .stopAcquisition()

        runtime.dispose()
      },
    )

    it(
      'turns a stopped acquisition into attempt 1 and canonical results',
      async () => {
        let id = 0

        const {
          runtime,
        } =
          configuredRuntime(
            () =>
              `id-${++id}`,
          )

        await armRuntime(
          runtime,
        )

        await runtime
          .startAcquisition()

        const result =
          await runtime
            .stopAcquisition()

        expect(
          result.qualityStatus,
        ).toBe('VALID')

        expect(
          result.primaryMetricKey,
        ).toBe('peak_nkg')

        expect(
          result.primaryValue,
        ).toBe(8)

        expect(
          runtime.snapshot
            .runner.phase,
        ).toBe('review')

        const attempt =
          runtime.snapshot
            .runner.items[0]
            .attempts[0]

        expect(
          attempt.attempt
            .attemptNumber,
        ).toBe(1)

        expect(
          attempt.canonical
            .metrics.some(
              metric =>
                metric.metricKey ===
                'peak_nkg' &&
                metric.isPrimary,
            ),
        ).toBe(true)

        runtime.dispose()
      },
    )

    it(
      'repeats acquisitions without creating another test item',
      async () => {
        let id = 0

        const {
          runtime,
        } =
          configuredRuntime(
            () =>
              `id-${++id}`,
          )

        await armRuntime(
          runtime,
        )

        await runtime
          .startAcquisition()

        await runtime
          .stopAcquisition()

        runtime.retry()
        runtime.beginCountdown(0)

        await runtime
          .startAcquisition()

        await runtime
          .stopAcquisition()

        const item =
          runtime.snapshot
            .runner.items[0]

        expect(
          runtime.snapshot
            .runner.items,
        ).toHaveLength(1)

        expect(
          item.attempts,
        ).toHaveLength(2)

        expect(
          item.attempts.map(
            entry =>
              entry.attempt
                .attemptNumber,
          ),
        ).toEqual([1, 2])

        expect(
          new Set(
            item.attempts.map(
              entry =>
                entry.attempt
                  .testSessionItemId,
            ),
          ),
        ).toEqual(
          new Set([
            'item-right',
          ]),
        )

        runtime.dispose()
      },
    )

    it(
      'selects an attempt and completes the test item and session',
      async () => {
        let id = 0

        const {
          runtime,
        } =
          configuredRuntime(
            () =>
              `id-${++id}`,
          )

        await armRuntime(
          runtime,
        )

        await runtime
          .startAcquisition()

        await runtime
          .stopAcquisition()

        const attemptId =
          runtime.snapshot
            .runner.items[0]
            .attempts[0]
            .attempt
            .attemptId

        runtime.selectAttempt(
          attemptId,
        )

        runtime
          .completeActiveItem()

        runtime.finishSession(
          '2026-09-12T09:30:00.000Z',
        )

        expect(
          runtime.snapshot
            .runner.phase,
        ).toBe('completed')

        expect(
          runtime.snapshot
            .runner.session.status,
        ).toBe('completed')

        runtime.dispose()
      },
    )

    it(
      'maps protocol-specific acquisition settings from the test item',
      () => {
        const runner =
          createLiveTestRunner(
            profile,
            'athlete-1',
            {
              sessionId:
                'session-config',

              bodyWeightKg:
                70,
            },
          )

        const item =
          createTestSessionItemDraft(
            runner.session,
            1,
            'rfd',
            {
              id:
                'rfd-item',

              side:
                'left',

              grip:
                '20 mm',

              config: {
                rfdWindowMs:
                  150,

                targetN:
                  300,

                criticalForceIntervals: [
                  {
                    durationSeconds:
                      10,

                    workJoules:
                      2400,
                  },

                  {
                    durationSeconds:
                      20,

                    workJoules:
                      4300,
                  },
                ],
              },
            },
          )

        expect(
          buildLiveAcquisitionConfig(
            runner.session,
            item,
          ),
        ).toMatchObject({
          protocolKey:
            'rfd',

          protocolVersion:
            '1.0',

          bodyWeightKg:
            70,

          targetN:
            300,

          rfdWindowMs:
            150,

          side:
            'left',

          grip:
            '20 mm',

          criticalForceIntervals: [
            {
              durationSeconds:
                10,

              workJoules:
                2400,
            },

            {
              durationSeconds:
                20,

              workJoules:
                4300,
            },
          ],
        })
      },
    )

    it(
      'provides the real mock Tindeq implementation for UI development',
      () => {
        const runtime =
          createMockLiveTestRuntime(
            profile,
            'athlete-1',
            {
              sessionId:
                'mock-session',

              sampleHz:
                80,
            },
          )

        expect(
          runtime.deviceKind,
        ).toBe(
          'mock-tindeq',
        )

        expect(
          runtime.snapshot
            .runner.session.mode,
        ).toBe('live')

        runtime.dispose()
      },
    )
  },
)
