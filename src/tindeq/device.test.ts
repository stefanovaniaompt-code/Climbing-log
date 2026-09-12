import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  TindeqProgressorAdapter,
  type BleTransport,
  type DeviceConnectionState,
  type MeasurementDeviceInfo,
} from './device'

import {
  TindeqCommand,
} from './protocol'

class FakeTransport
implements BleTransport {
  readonly isSupported:
    boolean

  writes:
    Uint8Array[] = []

  disconnectCalls = 0

  private onDisconnect:
    ((reason?: Error) => void) |
    null = null

  constructor(
    supported = true,
  ) {
    this.isSupported =
      supported
  }

  async connect(
    _onData:
      (value: DataView) => void,

    onDisconnect:
      (reason?: Error) => void,
  ): Promise<MeasurementDeviceInfo> {
    this.onDisconnect =
      onDisconnect

    return {
      id: 'fake-progressor',
      name: 'Fake Progressor',
    }
  }

  async write(
    value: Uint8Array,
  ) {
    this.writes.push(
      value.slice(),
    )
  }

  async disconnect() {
    this.disconnectCalls += 1
  }

  triggerDisconnect(
    reason?: Error,
  ) {
    this.onDisconnect?.(
      reason,
    )
  }
}

describe(
  'Tindeq device adapter robustness',
  () => {
    it(
      'connects and sends start and stop commands in order',
      async () => {
        const transport =
          new FakeTransport()

        const device =
          new TindeqProgressorAdapter(
            transport,
          )

        await device.connect()
        await device.start()
        await device.stop()

        expect(
          device.connectionState,
        ).toBe('connected')

        expect(
          transport.writes.map(
            value =>
              value[0],
          ),
        ).toEqual([
          TindeqCommand
            .StartWeightMeasurement,

          TindeqCommand
            .StopWeightMeasurement,
        ])
      },
    )

    it(
      'does not automatically queue firmware and battery commands on connect',
      async () => {
        const transport =
          new FakeTransport()

        const device =
          new TindeqProgressorAdapter(
            transport,
          )

        await device.connect()

        expect(
          transport.writes,
        ).toHaveLength(0)
      },
    )

    it(
      'moves to error after an unexpected radio disconnect',
      async () => {
        const transport =
          new FakeTransport()

        const device =
          new TindeqProgressorAdapter(
            transport,
          )

        let latest:
          DeviceConnectionState =
            'disconnected'

        device.subscribe(
          event => {
            if (
              event.type ===
              'connection'
            ) {
              latest =
                event.state
            }
          },
        )

        await device.connect()
        await device.start()

        transport
          .triggerDisconnect(
            new Error(
              'radio lost',
            ),
          )

        expect(latest)
          .toBe('error')

        expect(
          device.connectionState,
        ).toBe('error')

        expect(device.info)
          .toBeNull()

        /*
         * measuring was cleared by the disconnect,
         * so STOP must not generate another BLE write.
         */
        await device.stop()

        expect(
          transport.writes,
        ).toHaveLength(1)
      },
    )

    it(
      'clears device state on explicit disconnect',
      async () => {
        const transport =
          new FakeTransport()

        const device =
          new TindeqProgressorAdapter(
            transport,
          )

        await device.connect()
        await device.disconnect()

        expect(
          device.connectionState,
        ).toBe(
          'disconnected',
        )

        expect(device.info)
          .toBeNull()

        expect(
          transport.disconnectCalls,
        ).toBe(1)
      },
    )

    it(
      'rejects an unsupported BLE transport',
      async () => {
        const device =
          new TindeqProgressorAdapter(
            new FakeTransport(
              false,
            ),
          )

        await expect(
          device.connect(),
        ).rejects.toThrow(
          'Bluetooth non supportato',
        )
      },
    )
  },
)
