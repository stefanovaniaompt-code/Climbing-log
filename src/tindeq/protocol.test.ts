import { describe, expect, it } from 'vitest'
import { encodeTindeqCommand, NEWTONS_PER_KGF, TindeqCommand, TindeqResponse, TindeqStreamParser } from './protocol'

function measurementPacket(...records: Array<[number, number]>) {
  const packet = new Uint8Array(2 + records.length * 8)
  packet[0] = TindeqResponse.WeightMeasurement
  packet[1] = records.length * 8
  const view = new DataView(packet.buffer)
  records.forEach(([kgf, micros], index) => {
    view.setFloat32(2 + index * 8, kgf, true)
    view.setUint32(6 + index * 8, micros, true)
  })
  return packet
}

describe('Tindeq official protocol parser', () => {
  it('encodes official one-byte commands', () => {
    expect([...encodeTindeqCommand(TindeqCommand.Tare)]).toEqual([100])
    expect([...encodeTindeqCommand(TindeqCommand.StartWeightMeasurement)]).toEqual([101])
  })

  it('parses little-endian force records and converts kgf to Newton', () => {
    const messages = new TindeqStreamParser().push(measurementPacket([10, 1_000_000], [12.5, 1_010_000]))
    expect(messages).toHaveLength(1)
    const message = messages[0]
    expect(message.type).toBe('samples')
    if (message.type !== 'samples') return
    expect(message.samples[0]).toMatchObject({ timestampMicros: 1_000_000, sourceForceKgf: 10, unit: 'N' })
    expect(message.samples[0].forceN).toBeCloseTo(10 * NEWTONS_PER_KGF, 5)
    expect(message.samples[1].sourceForceKgf).toBeCloseTo(12.5)
  })

  it('buffers incomplete BLE chunks and accepts concatenated TLV messages', () => {
    const parser = new TindeqStreamParser()
    const packet = measurementPacket([20, 42])
    expect(parser.push(packet.slice(0, 5))).toEqual([])
    expect(parser.pendingBytes).toBe(5)
    const messages = parser.push(new Uint8Array([...packet.slice(5), TindeqResponse.LowPowerWarning, 0]))
    expect(messages.map(message => message.type)).toEqual(['samples', 'low-power'])
    expect(parser.pendingBytes).toBe(0)
  })

  it('reports incomplete records without inventing samples', () => {
    const parser = new TindeqStreamParser()
    const message = parser.push(Uint8Array.of(TindeqResponse.WeightMeasurement, 5, 0, 0, 0, 0, 7))[0]
    expect(message).toMatchObject({ type: 'samples', samples: [], discardedBytes: 5 })
  })
})
