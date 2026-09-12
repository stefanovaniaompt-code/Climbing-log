import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  TindeqAcquisition,
} from './acquisition'

import type {
  DeviceConnectionState,
  DeviceEventListener,
  MeasurementDevice,
  MeasurementDeviceInfo,
} from './device'

import type {
  TindeqForceSample,
} from './protocol'

class AcquisitionDevice
implements MeasurementDevice {
  readonly kind =
    'mock-tindeq' as const

  connectionState:
    DeviceConnectionState =
      'connected'

  info:
    MeasurementDeviceInfo | null = {
      id: 'acquisition-device',
      name: 'Acquisition Device',
    }

  failStop = false

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
    return this.info!
  }

  async reconnect() {
    return this.info!
  }

  async disconnect() {
    this.connectionState =
      'disconnected'
  }

  async tare() {}

  async start() {}

  async stop() {
    if (this.failStop) {
      throw new Error(
        'radio disappeared',
      )
    }
  }

  async refreshDeviceInfo() {
    return this.info!
  }

  samples(
    samples:
      TindeqForceSample[],
  ) {
    this.emit({
      type: 'samples',
      samples,
      receivedAt:
        new Date()
          .toISOString(),
      sequence: 1,
    })
  }

  unexpectedDisconnect() {
    this.connectionState =
      'error'

    this.emit({
      type: 'connection',
      state: 'error',
      error: 'radio lost',
    })
  }
}

const config = {
  protocolKey:
    'peak_force' as const,

  protocolVersion:
    '1.0',

  bodyWeightKg:
    60,

  side:
    'right' as const,

  grip:
    '20 mm',
}

const points:
  TindeqForceSample[] = [
    0,
    100,
    250,
    400,
  ].map(
    (forceN, index) => ({
      forceN,

      timestampMicros:
        index * 100_000,

      sourceForceKgf:
        forceN / 9.80665,

      unit:
        'N' as const,
    }),
  )

describe(
  'Tindeq acquisition robustness',
  () => {
    it(
      'marks a stopped acquisition for review if STOP fails',
      async () => {
        const device =
          new AcquisitionDevice()

        const acquisition =
          new TindeqAcquisition(
            device,
            config,
          )

        await acquisition.start()

        device.samples(
          points,
        )

        device.failStop =
          true

        const result =
          await acquisition.stop()

        expect(
          result.qualityStatus,
        ).toBe('REVIEW')

        expect(
          result.qualityFlags,
        ).toContain(
          'stop-error',
        )

        expect(
          result.samples,
        ).toHaveLength(4)
      },
    )

    it(
      'marks an unexpected disconnect for review without losing samples',
      async () => {
        const device =
          new AcquisitionDevice()

        const acquisition =
          new TindeqAcquisition(
            device,
            config,
          )

        await acquisition.start()

        device.samples(
          points,
        )

        device
          .unexpectedDisconnect()

        const result =
          await acquisition.stop()

        expect(
          result.qualityStatus,
        ).toBe('REVIEW')

        expect(
          result.qualityFlags,
        ).toContain(
          'disconnect',
        )

        expect(
          result.samples,
        ).toHaveLength(4)
      },
    )

    it(
      'detects non monotonic sample timestamps',
      async () => {
        const device =
          new AcquisitionDevice()

        const acquisition =
          new TindeqAcquisition(
            device,
            config,
          )

        await acquisition.start()

        device.samples([
          points[0],
          points[2],
          points[1],
          points[3],
        ])

        const result =
          await acquisition.stop()

        expect(
          result.qualityStatus,
        ).toBe('REVIEW')

        expect(
          result.qualityFlags,
        ).toContain(
          'timestamp-order',
        )
      },
    )
  },
)
