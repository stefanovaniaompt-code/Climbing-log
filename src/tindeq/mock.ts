import type { DeviceConnectionState, DeviceEventListener, MeasurementDevice, MeasurementDeviceInfo } from './device'
import type { TindeqForceSample } from './protocol'

export class MockTindeqDevice implements MeasurementDevice {
  readonly kind = 'mock-tindeq' as const
  connectionState: DeviceConnectionState = 'disconnected'
  info: MeasurementDeviceInfo | null = null
  private listeners = new Set<DeviceEventListener>()
  private interval: number | null = null
  private startedAt = 0
  private taredOffset = 0
  private sampleIndex = 0

  constructor(private readonly sampleHz = 80) {}

  subscribe(listener: DeviceEventListener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit(event: Parameters<DeviceEventListener>[0]) { for (const listener of this.listeners) listener(event) }

  async connect() {
    this.connectionState = 'connected'
    this.info = { id: 'mock-progressor', name: 'Tindeq simulato', firmwareVersion: 'mock-1.0', batteryMillivolts: 4050 }
    this.emit({ type: 'connection', state: 'connected' })
    this.emit({ type: 'device-info', info: this.info })
    return this.info
  }

  async reconnect() { return this.connect() }

  async disconnect() {
    await this.stop()
    this.connectionState = 'disconnected'
    this.emit({ type: 'connection', state: 'disconnected' })
  }

  async tare() { this.taredOffset = this.currentForceN() }
  async refreshDeviceInfo() { if (!this.info) throw new Error('Mock non collegato.'); return this.info }

  async start() {
    if (this.interval !== null) return
    if (this.connectionState !== 'connected') throw new Error('Mock non collegato.')
    this.startedAt = performance.now()
    this.sampleIndex = 0
    const period = 1000 / this.sampleHz
    this.interval = window.setInterval(() => {
      const forceN = Math.max(0, this.currentForceN() - this.taredOffset)
      const sample: TindeqForceSample = { timestampMicros: Math.round((performance.now() - this.startedAt) * 1000), forceN, sourceForceKgf: forceN / 9.80665, unit: 'N' }
      this.emit({ type: 'samples', samples: [sample], receivedAt: new Date().toISOString(), sequence: this.sampleIndex++ })
    }, period)
  }

  async stop() {
    if (this.interval !== null) window.clearInterval(this.interval)
    this.interval = null
  }

  private currentForceN() {
    const seconds = this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0
    const cycle = seconds % 10
    const envelope = cycle < 1 ? cycle : cycle < 6 ? 1 : cycle < 7 ? 7 - cycle : 0
    return 420 * envelope + Math.sin(seconds * 31) * 2
  }
}
