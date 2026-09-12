import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const android = readFileSync(
  'android/app/src/main/AndroidManifest.xml',
  'utf8',
)

const ios = readFileSync(
  'ios/App/App/Info.plist',
  'utf8',
)

const packageJson = JSON.parse(
  readFileSync(
    'package.json',
    'utf8',
  ),
)

const factory = readFileSync(
  'src/tindeq/deviceFactory.ts',
  'utf8',
)

test(
  'Android declares BLE scan and connect permissions',
  () => {
    assert.match(
      android,
      /android\.permission\.BLUETOOTH_SCAN/,
    )

    assert.match(
      android,
      /android\.permission\.BLUETOOTH_CONNECT/,
    )

    assert.match(
      android,
      /neverForLocation/,
    )
  },
)

test(
  'legacy Android BLE keeps location permissions limited to SDK 30',
  () => {
    assert.match(
      android,
      /ACCESS_COARSE_LOCATION[^>]*maxSdkVersion="30"/,
    )

    assert.match(
      android,
      /ACCESS_FINE_LOCATION[^>]*maxSdkVersion="30"/,
    )
  },
)

test(
  'iOS includes Bluetooth privacy usage description',
  () => {
    assert.match(
      ios,
      /NSBluetoothAlwaysUsageDescription/,
    )

    assert.match(
      ios,
      /Tindeq Progressor/,
    )
  },
)

test(
  'native Bluetooth background mode is intentionally not enabled',
  () => {
    assert.doesNotMatch(
      ios,
      /bluetooth-central/,
    )
  },
)

test(
  'Capacitor native and BLE packages are installed',
  () => {
    assert.equal(
      packageJson.dependencies[
        '@capacitor-community/bluetooth-le'
      ],
      '8.3.0',
    )

    assert.equal(
      packageJson.dependencies[
        '@capacitor/android'
      ],
      '8.5.1',
    )

    assert.equal(
      packageJson.dependencies[
        '@capacitor/ios'
      ],
      '8.5.1',
    )
  },
)

test(
  'Progressor factory supports native and web transports',
  () => {
    assert.match(
      factory,
      /NativeBluetoothTransport/,
    )

    assert.match(
      factory,
      /WebBluetoothTransport/,
    )

    assert.match(
      factory,
      /Capacitor\.isNativePlatform/,
    )
  },
)
