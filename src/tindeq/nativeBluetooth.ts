import {
  Capacitor,
} from '@capacitor/core'

import {
  BleClient,
} from '@capacitor-community/bluetooth-le'

import type {
  BleTransport,
  MeasurementDeviceInfo,
} from './device'

import {
  TINDEQ_CONTROL_CHARACTERISTIC_UUID,
  TINDEQ_DATA_CHARACTERISTIC_UUID,
  TINDEQ_PROGRESSOR_SERVICE_UUID,
} from './protocol'

export class NativeBluetoothTransport
implements BleTransport {
  readonly isSupported =
    Capacitor.isNativePlatform()

  private deviceId:
    string | null =
      null

  private initialized =
    false

  /*
   * Every connection gets a generation.
   * A delayed disconnect callback belonging to an
   * old connection must not kill a newer connection.
   */
  private generation = 0

  private async initializeBle() {
    if (
      !this.isSupported
    ) {
      throw new Error(
        'Trasporto BLE nativo disponibile solo nell app Android/iOS.',
      )
    }

    if (!this.initialized) {
      await BleClient.initialize({
        androidNeverForLocation:
          true,
      })

      this.initialized = true
    }

    const enabled =
      await BleClient
        .isEnabled()

    if (enabled) return

    if (
      Capacitor.getPlatform() ===
      'android'
    ) {
      /*
       * Android can show the system enable-Bluetooth
       * dialog. iOS intentionally cannot.
       */
      await BleClient
        .requestEnable()

      const enabledAfterRequest =
        await BleClient
          .isEnabled()

      if (
        enabledAfterRequest
      ) {
        return
      }
    }

    throw new Error(
      'Bluetooth disattivato. Attivalo nelle impostazioni del dispositivo e riprova.',
    )
  }

  async connect(
    onData:
      (value: DataView) => void,

    onDisconnect:
      (reason?: Error) => void,
  ): Promise<MeasurementDeviceInfo> {
    await this.initializeBle()

    /*
     * Remove our own previous connection first.
     * This also invalidates its disconnect callback.
     */
    await this.disconnect()

    const device =
      await BleClient
        .requestDevice({
          services: [
            TINDEQ_PROGRESSOR_SERVICE_UUID,
          ],
        })

    const connectionGeneration =
      ++this.generation

    /*
     * Some Android devices can retain a stale GATT
     * connection. The plugin itself recommends
     * disconnecting before connecting again.
     */
    await BleClient
      .disconnect(
        device.deviceId,
      )
      .catch(
        () => undefined,
      )

    try {
      await BleClient.connect(
        device.deviceId,
        () => {
          if (
            connectionGeneration !==
            this.generation
          ) {
            return
          }

          this.deviceId = null

          onDisconnect(
            new Error(
              'Connessione Bluetooth Tindeq interrotta.',
            ),
          )
        },
      )

      if (
        connectionGeneration !==
        this.generation
      ) {
        throw new Error(
          'Connessione Tindeq superata da una nuova richiesta.',
        )
      }

      this.deviceId =
        device.deviceId

      try {
        await BleClient
          .startNotifications(
            device.deviceId,
            TINDEQ_PROGRESSOR_SERVICE_UUID,
            TINDEQ_DATA_CHARACTERISTIC_UUID,
            onData,
          )
      } catch (reason) {
        await this.disconnect()
        throw reason
      }

      return {
        id:
          device.deviceId,

        name:
          device.name ||
          'Tindeq Progressor',
      }
    } catch (reason) {
      if (
        connectionGeneration ===
        this.generation
      ) {
        this.deviceId = null
      }

      throw reason
    }
  }

  async write(
    value: Uint8Array,
  ) {
    if (!this.deviceId) {
      throw new Error(
        'Tindeq non collegato.',
      )
    }

    const copy =
      value.slice()

    await BleClient.write(
      this.deviceId,
      TINDEQ_PROGRESSOR_SERVICE_UUID,
      TINDEQ_CONTROL_CHARACTERISTIC_UUID,
      new DataView(
        copy.buffer,
      ),
    )
  }

  async disconnect() {
    /*
     * Invalidate callbacks from the connection being
     * explicitly closed before asking the native
     * stack to disconnect.
     */
    this.generation += 1

    if (!this.deviceId) {
      return
    }

    const id =
      this.deviceId

    this.deviceId = null

    await BleClient
      .stopNotifications(
        id,
        TINDEQ_PROGRESSOR_SERVICE_UUID,
        TINDEQ_DATA_CHARACTERISTIC_UUID,
      )
      .catch(
        () => undefined,
      )

    await BleClient
      .disconnect(id)
      .catch(
        () => undefined,
      )
  }
}
