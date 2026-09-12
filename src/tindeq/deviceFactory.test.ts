import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  resolveProgressorTransportKind,
} from './deviceFactory'

describe(
  'Progressor device factory',
  () => {
    it(
      'prefers native BLE on Capacitor Android/iOS',
      () => {
        expect(
          resolveProgressorTransportKind(
            true,
            true,
          ),
        ).toBe('native')

        expect(
          resolveProgressorTransportKind(
            true,
            false,
          ),
        ).toBe('native')
      },
    )

    it(
      'uses Web Bluetooth outside native apps when available',
      () => {
        expect(
          resolveProgressorTransportKind(
            false,
            true,
          ),
        ).toBe('web')
      },
    )

    it(
      'reports unsupported when neither transport is available',
      () => {
        expect(
          resolveProgressorTransportKind(
            false,
            false,
          ),
        ).toBe(
          'unsupported',
        )
      },
    )
  },
)
