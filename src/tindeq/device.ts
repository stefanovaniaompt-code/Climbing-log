import { decodeBatteryMillivolts, decodeFirmwareVersion, encodeTindeqCommand, TindeqCommand, TindeqStreamParser, type TindeqForceSample, type TindeqProtocolMessage } from './protocol'

export type DeviceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
export type MeasurementDeviceInfo = { id: string; name: string; firmwareVersion?: string; batteryMillivolts?: number }
export type MeasurementDeviceEvent =
  | { type: 'samples'; samples: TindeqForceSample[]; receivedAt: string; sequence: number }
  | { type: 'connection'; state: DeviceConnectionState; error?: string }
  | { type: 'device-info'; info: MeasurementDeviceInfo }
  | { type: 'warning'; code: 'low-battery' | 'incomplete-packet' | 'unknown-message'; message: string }

export type DeviceEventListener = (event: MeasurementDeviceEvent) => void

export interface MeasurementDevice {
  readonly kind: 'tindeq-progressor' | 'mock-tindeq'
  readonly connectionState: DeviceConnectionState
  readonly info: MeasurementDeviceInfo | null
  subscribe(listener: DeviceEventListener): () => void
  connect(): Promise<MeasurementDeviceInfo>
  reconnect(): Promise<MeasurementDeviceInfo>
  disconnect(): Promise<void>
  tare(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  refreshDeviceInfo(): Promise<MeasurementDeviceInfo>
}

export interface BleTransport {
  readonly isSupported: boolean
  connect(onData: (value: DataView) => void, onDisconnect: (reason?: Error) => void): Promise<MeasurementDeviceInfo>
  write(value: Uint8Array): Promise<void>
  disconnect(): Promise<void>
}

type PendingCommand = { command: TindeqCommand; resolve: (payload: Uint8Array) => void; reject: (reason: unknown) => void; timeout: number }

export class TindeqProgressorAdapter implements MeasurementDevice {
  readonly kind = 'tindeq-progressor' as const
  connectionState: DeviceConnectionState = 'disconnected'
  info: MeasurementDeviceInfo | null = null
  private listeners = new Set<DeviceEventListener>()
  private parser = new TindeqStreamParser()
  private pendingCommand: PendingCommand | null = null
  private commandQueue: Promise<unknown> = Promise.resolve()
  private sequence = 0
  private measuring = false

  constructor(private readonly transport: BleTransport) {}

  subscribe(listener: DeviceEventListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: MeasurementDeviceEvent) {
    for (const listener of this.listeners) listener(event)
  }

  private setConnection(state: DeviceConnectionState, error?: string) {
    this.connectionState = state
    this.emit({ type: 'connection', state, error })
  }

  async connect() {
    if (this.connectionState === 'connected' && this.info) return this.info
    if (!this.transport.isSupported) throw new Error('Bluetooth non supportato su questo dispositivo.')
    this.setConnection('connecting')
    this.parser.reset()
    try {
      this.info = await this.transport.connect(value => this.handleData(value), reason => this.handleDisconnect(reason))
      this.setConnection('connected')
      this.emit({ type: 'device-info', info: this.info })
      void this.refreshDeviceInfo().catch(() => undefined)
      return this.info
    } catch (reason) {
      this.setConnection('error', reason instanceof Error ? reason.message : 'Connessione Tindeq non riuscita.')
      throw reason
    }
  }

  async reconnect() {
    this.setConnection('reconnecting')
    await this.transport.disconnect().catch(() => undefined)
    this.connectionState = 'disconnected'
    return this.connect()
  }

  async disconnect() {
    if (this.measuring) await this.stop().catch(() => undefined)
    this.rejectPending(new Error('Tindeq disconnesso.'))
    await this.transport.disconnect()
    this.parser.reset()
    this.setConnection('disconnected')
  }

  async tare() { await this.sendCommand(TindeqCommand.Tare, false) }

  async start() {
    if (this.measuring) return
    await this.sendCommand(TindeqCommand.StartWeightMeasurement, false)
    this.measuring = true
  }

  async stop() {
    if (!this.measuring) return
    await this.sendCommand(TindeqCommand.StopWeightMeasurement, false)
    this.measuring = false
  }

  async refreshDeviceInfo() {
    if (!this.info) throw new Error('Collega prima il Tindeq.')
    const firmware = await this.sendCommand(TindeqCommand.GetAppVersion, true)
    const battery = await this.sendCommand(TindeqCommand.GetBatteryVoltage, true)
    this.info = { ...this.info, firmwareVersion: decodeFirmwareVersion(firmware), batteryMillivolts: decodeBatteryMillivolts(battery) ?? undefined }
    this.emit({ type: 'device-info', info: this.info })
    return this.info
  }

  private sendCommand(command: TindeqCommand, expectsResponse: boolean): Promise<Uint8Array> {
    const operation = this.commandQueue.then(async () => {
      if (this.connectionState !== 'connected') throw new Error('Tindeq non collegato.')
      if (!expectsResponse) {
        await this.transport.write(encodeTindeqCommand(command))
        return new Uint8Array(0)
      }
      return new Promise<Uint8Array>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          if (this.pendingCommand?.command === command) this.pendingCommand = null
          reject(new Error(`Nessuna risposta Tindeq al comando ${command}.`))
        }, 2500)
        this.pendingCommand = { command, resolve, reject, timeout }
        this.transport.write(encodeTindeqCommand(command)).catch(reason => {
          this.rejectPending(reason)
        })
      })
    })
    this.commandQueue = operation.catch(() => undefined)
    return operation
  }

  private rejectPending(reason: unknown) {
    if (!this.pendingCommand) return
    window.clearTimeout(this.pendingCommand.timeout)
    this.pendingCommand.reject(reason)
    this.pendingCommand = null
  }

  private handleData(value: DataView) {
    for (const message of this.parser.push(value)) this.handleMessage(message)
  }

  private handleMessage(message: TindeqProtocolMessage) {
    if (message.type === 'samples') {
      if (message.discardedBytes) this.emit({ type: 'warning', code: 'incomplete-packet', message: `${message.discardedBytes} byte non validi esclusi.` })
      if (message.samples.length) this.emit({ type: 'samples', samples: message.samples, receivedAt: new Date().toISOString(), sequence: this.sequence++ })
      return
    }
    if (message.type === 'command-response' && this.pendingCommand) {
      window.clearTimeout(this.pendingCommand.timeout)
      this.pendingCommand.resolve(message.payload)
      this.pendingCommand = null
      return
    }
    if (message.type === 'low-power') {
      this.emit({ type: 'warning', code: 'low-battery', message: 'Batteria Tindeq quasi scarica.' })
      return
    }
    this.emit({ type: 'warning', code: 'unknown-message', message: `Messaggio Tindeq ${message.type} non usato in questa acquisizione.` })
  }

  private handleDisconnect(reason?: Error) {
    this.measuring = false
    this.rejectPending(reason ?? new Error('Tindeq disconnesso.'))
    this.setConnection(reason ? 'error' : 'disconnected', reason?.message)
  }
}
