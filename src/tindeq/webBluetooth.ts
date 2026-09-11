import type { BleTransport, MeasurementDeviceInfo } from './device'
import { TINDEQ_CONTROL_CHARACTERISTIC_UUID, TINDEQ_DATA_CHARACTERISTIC_UUID, TINDEQ_PROGRESSOR_SERVICE_UUID } from './protocol'

type BluetoothCharacteristicLike = {
  value?: DataView | null
  startNotifications(): Promise<BluetoothCharacteristicLike>
  stopNotifications(): Promise<BluetoothCharacteristicLike>
  writeValueWithResponse?(value: BufferSource): Promise<void>
  writeValue?(value: BufferSource): Promise<void>
  addEventListener(type: 'characteristicvaluechanged', listener: EventListener): void
  removeEventListener(type: 'characteristicvaluechanged', listener: EventListener): void
}
type BluetoothDeviceLike = EventTarget & { id: string; name?: string; gatt?: { connected: boolean; connect(): Promise<{ getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike> }> }>; disconnect(): void } }
type BluetoothNavigator = Navigator & { bluetooth?: { requestDevice(options: { filters: Array<{ services: string[] }> }): Promise<BluetoothDeviceLike> } }

export class WebBluetoothTransport implements BleTransport {
  readonly isSupported = typeof navigator !== 'undefined' && Boolean((navigator as BluetoothNavigator).bluetooth)
  private device: BluetoothDeviceLike | null = null
  private dataCharacteristic: BluetoothCharacteristicLike | null = null
  private controlCharacteristic: BluetoothCharacteristicLike | null = null
  private onValue: EventListener | null = null
  private onDisconnected: EventListener | null = null

  async connect(onData: (value: DataView) => void, onDisconnect: (reason?: Error) => void): Promise<MeasurementDeviceInfo> {
    const bluetooth = (navigator as BluetoothNavigator).bluetooth
    if (!bluetooth) throw new Error('Web Bluetooth non disponibile. Usa Chrome/Edge su Android o la app installata.')
    await this.disconnect()
    const device = await bluetooth.requestDevice({ filters: [{ services: [TINDEQ_PROGRESSOR_SERVICE_UUID] }] })
    if (!device.gatt) throw new Error('Il dispositivo selezionato non espone GATT.')
    const server = await device.gatt.connect()
    const service = await server.getPrimaryService(TINDEQ_PROGRESSOR_SERVICE_UUID)
    const [dataCharacteristic, controlCharacteristic] = await Promise.all([
      service.getCharacteristic(TINDEQ_DATA_CHARACTERISTIC_UUID),
      service.getCharacteristic(TINDEQ_CONTROL_CHARACTERISTIC_UUID),
    ])
    this.device = device
    this.dataCharacteristic = dataCharacteristic
    this.controlCharacteristic = controlCharacteristic
    this.onValue = event => {
      const value = (event.target as unknown as BluetoothCharacteristicLike).value
      if (value) onData(value)
    }
    this.onDisconnected = () => onDisconnect()
    dataCharacteristic.addEventListener('characteristicvaluechanged', this.onValue)
    device.addEventListener('gattserverdisconnected', this.onDisconnected)
    await dataCharacteristic.startNotifications()
    return { id: device.id, name: device.name || 'Tindeq Progressor' }
  }

  async write(value: Uint8Array) {
    if (!this.controlCharacteristic) throw new Error('Tindeq non collegato.')
    const payload = value.slice().buffer
    if (this.controlCharacteristic.writeValueWithResponse) await this.controlCharacteristic.writeValueWithResponse(payload)
    else if (this.controlCharacteristic.writeValue) await this.controlCharacteristic.writeValue(payload)
    else throw new Error('Scrittura BLE non supportata dal browser.')
  }

  async disconnect() {
    const data = this.dataCharacteristic
    if (data && this.onValue) data.removeEventListener('characteristicvaluechanged', this.onValue)
    if (data) await data.stopNotifications().catch(() => undefined)
    if (this.device && this.onDisconnected) this.device.removeEventListener('gattserverdisconnected', this.onDisconnected)
    if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    this.device = null
    this.dataCharacteristic = null
    this.controlCharacteristic = null
    this.onValue = null
    this.onDisconnected = null
  }
}
