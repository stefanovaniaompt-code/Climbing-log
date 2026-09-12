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
  LiveTestRuntime,
} from './liveTestRuntime'

const profile:
  AppProfile = {
    userId: 'coach-1',
    displayName: 'Monica',
    role: 'coach',
    athleteId: null,
    capabilities: {
      canAccessCoachArea:
        true,
      canAccessAthleteArea:
        false,
    },
    workspaceId:
      'workspace-1',
    workspaceName:
      'Coach workspace',
    onboardingCompletedAt:
      '2026-01-01T10:00:00.000Z',
    mustChangePassword:
      false,
  }

class DisconnectDevice
implements MeasurementDevice {
  readonly kind =
    'mock-tindeq' as const

  connectionState:
    DeviceConnectionState =
      'disconnected'

  info:
    MeasurementDeviceInfo | null =
      null

  private listeners =
    new Set<
      DeviceEventListener
    >()

  subscribe(
    listener:
      DeviceEventListener,
  ) {
    this.listeners.add(
      listener,
    )

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
      id: 'disconnect-device',
      name: 'Disconnect device',
    }

    this.emit({
      type: 'connection',
      state: 'connected',
    })

    return this.info
  }

  async reconnect() {
    return this.connect()
  }

  async disconnect() {
    this.connectionState =
      'disconnected'

    this.info = null

    this.emit({
      type: 'connection',
      state: 'disconnected',
    })
  }

  async tare() {}

  async start() {
    const samples:
      TindeqForceSample[] = [
        0,
        150,
        300,
        480,
      ].map(
        (
          forceN,
          index,
        ) => ({
          timestampMicros:
            index *
            100_000,

          forceN,

          sourceForceKgf:
            forceN /
            9.80665,

          unit:
            'N' as const,
        }),
      )

    this.emit({
      type: 'samples',
      samples,
      receivedAt:
        '2026-09-12T10:00:00.000Z',
      sequence: 1,
    })
  }

  async stop() {}

  async refreshDeviceInfo() {
    return this.info!
  }

  loseConnection() {
    this.connectionState =
      'error'

    this.info = null

    this.emit({
      type: 'connection',
      state: 'error',
      error: 'radio lost',
    })
  }
}

async function configuredRuntime() {
  const runner =
    createLiveTestRunner(
      profile,
      'athlete-1',
      {
        sessionId:
          'session-safe',

        bodyWeightKg:
          60,
      },
    )

  const device =
    new DisconnectDevice()

  const runtime =
    new LiveTestRuntime(
      profile,
      runner,
      device,
      (() => {
        let id = 0
        return () =>
          `safe-${++id}`
      })(),
    )

  runtime.addItem(
    'peak_force',
    {
      itemId:
        'item-safe',

      side:
        'right',

      grip:
        '20 mm',
    },
  )

  await runtime.connect()

  runtime.activateItem(
    'item-safe',
  )

  runtime.beginCountdown(0)

  await runtime
    .startAcquisition()

  return {
    runtime,
    device,
  }
}

describe(
  'live runtime safety',
  () => {
    it(
      'turns an unexpected BLE disconnect into a REVIEW attempt',
      async () => {
        const {
          runtime,
          device,
        } =
          await configuredRuntime()

        device
          .loseConnection()

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              0,
            ),
        )

        expect(
          runtime.snapshot
            .runner.phase,
        ).toBe('review')

        const attempt =
          runtime.snapshot
            .runner.items[0]
            .attempts[0]
            .attempt
            .acquisition

        expect(
          attempt.qualityStatus,
        ).toBe('REVIEW')

        expect(
          attempt.qualityFlags,
        ).toContain(
          'disconnect',
        )

        runtime.dispose()
      },
    )

    it(
      'allows an active test to be interrupted explicitly when app backgrounds',
      async () => {
        const {
          runtime,
        } =
          await configuredRuntime()

        const result =
          await runtime
            .interruptAcquisition(
              'app-background',
            )

        expect(result)
          .not.toBeNull()

        expect(
          result?.qualityStatus,
        ).toBe('REVIEW')

        expect(
          result?.qualityFlags,
        ).toContain(
          'app-background',
        )

        expect(
          runtime.snapshot
            .runner.phase,
        ).toBe('review')

        runtime.dispose()
      },
    )
  },
)
