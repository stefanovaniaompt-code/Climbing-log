export const TINDEQ_PROGRESSOR_SERVICE_UUID = '7e4e1701-1ea6-40c9-9dcc-13d34ffead57'
export const TINDEQ_DATA_CHARACTERISTIC_UUID = '7e4e1702-1ea6-40c9-9dcc-13d34ffead57'
export const TINDEQ_CONTROL_CHARACTERISTIC_UUID = '7e4e1703-1ea6-40c9-9dcc-13d34ffead57'
export const NEWTONS_PER_KGF = 9.80665

export enum TindeqCommand {
  Tare = 100,
  StartWeightMeasurement = 101,
  StopWeightMeasurement = 102,
  StartPeakRfdMeasurement = 103,
  StartPeakRfdSeries = 104,
  AddCalibrationPoint = 105,
  SaveCalibration = 106,
  GetAppVersion = 107,
  GetErrorInformation = 108,
  ClearErrorInformation = 109,
  EnterSleep = 110,
  GetBatteryVoltage = 111,
}

export enum TindeqResponse {
  Command = 0,
  WeightMeasurement = 1,
  RfdPeak = 2,
  RfdPeakSeries = 3,
  LowPowerWarning = 4,
}

export type TindeqForceSample = {
  timestampMicros: number
  forceN: number
  sourceForceKgf: number
  unit: 'N'
}

export type TindeqProtocolMessage =
  | { type: 'samples'; samples: TindeqForceSample[]; payloadBytes: number; discardedBytes: number }
  | { type: 'command-response'; payload: Uint8Array }
  | { type: 'rfd-peak'; payload: Uint8Array }
  | { type: 'rfd-series'; payload: Uint8Array }
  | { type: 'low-power' }
  | { type: 'unknown'; tag: number; payload: Uint8Array }

export function encodeTindeqCommand(command: TindeqCommand): Uint8Array {
  return Uint8Array.of(command)
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.byteLength + right.byteLength)
  result.set(left)
  result.set(right, left.byteLength)
  return result
}

function decodeWeightPayload(payload: Uint8Array): Extract<TindeqProtocolMessage, { type: 'samples' }> {
  const recordBytes = payload.byteLength - (payload.byteLength % 8)
  const view = new DataView(payload.buffer, payload.byteOffset, recordBytes)
  const samples: TindeqForceSample[] = []
  for (let offset = 0; offset < recordBytes; offset += 8) {
    const sourceForceKgf = view.getFloat32(offset, true)
    const timestampMicros = view.getUint32(offset + 4, true)
    if (!Number.isFinite(sourceForceKgf)) continue
    samples.push({ timestampMicros, sourceForceKgf, forceN: sourceForceKgf * NEWTONS_PER_KGF, unit: 'N' })
  }
  return { type: 'samples', samples, payloadBytes: payload.byteLength, discardedBytes: payload.byteLength - recordBytes }
}

export class TindeqStreamParser {
  private pending: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

  reset() {
    this.pending = new Uint8Array(0)
  }

  get pendingBytes() {
    return this.pending.byteLength
  }

  push(chunk: ArrayBuffer | Uint8Array | DataView): TindeqProtocolMessage[] {
    const bytes = chunk instanceof Uint8Array
      ? chunk
      : chunk instanceof DataView
        ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        : new Uint8Array(chunk)
    this.pending = concatBytes(this.pending, bytes)
    const messages: TindeqProtocolMessage[] = []
    let offset = 0
    while (this.pending.byteLength - offset >= 2) {
      const tag = this.pending[offset]
      const payloadLength = this.pending[offset + 1]
      const messageLength = 2 + payloadLength
      if (this.pending.byteLength - offset < messageLength) break
      const payload = this.pending.slice(offset + 2, offset + messageLength)
      if (tag === TindeqResponse.WeightMeasurement) messages.push(decodeWeightPayload(payload))
      else if (tag === TindeqResponse.Command) messages.push({ type: 'command-response', payload })
      else if (tag === TindeqResponse.RfdPeak) messages.push({ type: 'rfd-peak', payload })
      else if (tag === TindeqResponse.RfdPeakSeries) messages.push({ type: 'rfd-series', payload })
      else if (tag === TindeqResponse.LowPowerWarning) messages.push({ type: 'low-power' })
      else messages.push({ type: 'unknown', tag, payload })
      offset += messageLength
    }
    this.pending = this.pending.slice(offset)
    return messages
  }
}

export function decodeBatteryMillivolts(payload: Uint8Array): number | null {
  if (payload.byteLength < 4) return null
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, true)
}

export function decodeFirmwareVersion(payload: Uint8Array): string {
  return new TextDecoder().decode(payload).replace(/\0+$/g, '').trim()
}
