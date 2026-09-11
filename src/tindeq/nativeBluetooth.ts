import { Capacitor } from '@capacitor/core'
import { BleClient } from '@capacitor-community/bluetooth-le'
import type { BleTransport, MeasurementDeviceInfo } from './device'
import { TINDEQ_CONTROL_CHARACTERISTIC_UUID, TINDEQ_DATA_CHARACTERISTIC_UUID, TINDEQ_PROGRESSOR_SERVICE_UUID } from './protocol'

export class NativeBluetoothTransport implements BleTransport {
  readonly isSupported = Capacitor.isNativePlatform()
  private deviceId: string | null = null
  private initialized = false

  async connect(onData: (value: DataView) => void, onDisconnect: (reason?: Error) => void): Promise<MeasurementDeviceInfo> {
    if (!this.isSupported) throw new Error('Trasporto BLE nativo disponibile solo nell’app Android/iOS.')
    if (!this.initialized) { await BleClient.initialize({ androidNeverForLocation: true }); this.initialized = true }
    await this.disconnect()
    const device = await BleClient.requestDevice({ services: [TINDEQ_PROGRESSOR_SERVICE_UUID] })
    await BleClient.connect(device.deviceId, () => { this.deviceId = null; onDisconnect() })
    this.deviceId = device.deviceId
    await BleClient.startNotifications(device.deviceId, TINDEQ_PROGRESSOR_SERVICE_UUID, TINDEQ_DATA_CHARACTERISTIC_UUID, onData)
    return { id: device.deviceId, name: device.name || 'Tindeq Progressor' }
  }

  async write(value: Uint8Array) {
    if (!this.deviceId) throw new Error('Tindeq non collegato.')
    const copy = value.slice()
    await BleClient.write(this.deviceId, TINDEQ_PROGRESSOR_SERVICE_UUID, TINDEQ_CONTROL_CHARACTERISTIC_UUID, new DataView(copy.buffer))
  }

  async disconnect() {
    if (!this.deviceId) return
    const id = this.deviceId
    this.deviceId = null
    await BleClient.stopNotifications(id, TINDEQ_PROGRESSOR_SERVICE_UUID, TINDEQ_DATA_CHARACTERISTIC_UUID).catch(() => undefined)
    await BleClient.disconnect(id).catch(() => undefined)
  }
}
