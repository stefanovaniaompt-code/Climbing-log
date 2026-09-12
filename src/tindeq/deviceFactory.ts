import {
  Capacitor,
} from '@capacitor/core'

import {
  TindeqProgressorAdapter,
  type BleTransport,
} from './device'

import {
  NativeBluetoothTransport,
} from './nativeBluetooth'

import {
  WebBluetoothTransport,
} from './webBluetooth'

export type ProgressorTransportKind =
  | 'native'
  | 'web'
  | 'unsupported'

export type ProgressorDeviceSelection = {
  device: TindeqProgressorAdapter
  transportKind: ProgressorTransportKind
  supported: boolean
}

export function resolveProgressorTransportKind(
  isNative: boolean,
  webBluetoothSupported: boolean,
): ProgressorTransportKind {
  if (isNative) {
    return 'native'
  }

  if (webBluetoothSupported) {
    return 'web'
  }

  return 'unsupported'
}

export function createProgressorDevice():
  ProgressorDeviceSelection {
  if (
    Capacitor.isNativePlatform()
  ) {
    const transport =
      new NativeBluetoothTransport()

    return {
      device:
        new TindeqProgressorAdapter(
          transport,
        ),

      transportKind:
        'native',

      supported:
        transport.isSupported,
    }
  }

  const transport:
    BleTransport =
      new WebBluetoothTransport()

  return {
    device:
      new TindeqProgressorAdapter(
        transport,
      ),

    transportKind:
      transport.isSupported
        ? 'web'
        : 'unsupported',

    supported:
      transport.isSupported,
  }
}
