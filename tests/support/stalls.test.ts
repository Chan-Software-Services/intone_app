import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { decodeWav } from '../../src/engine/audio/wav.ts'
import {
  attempts,
  deviceSilenceSeconds,
  longestSilenceSeconds,
  recordUnstalled,
  stallSeconds,
} from './stalls.ts'

// The stall check the fake-microphone tests record through
// (docs/fake-microphone.md, "When the machine stalls"), on takes made here
// from the middle voice's 16-bit file, the one the fake microphone plays,
// with the device's silence as exact zeros, as its captures hold it.

const wav = decodeWav(
  readFileSync(
    join(
      import.meta.dirname,
      '..',
      '..',
      'fixtures',
      'synthetic',
      'middle.wav',
    ),
  ),
)
const rate = wav.sampleRate
const source = wav.channels[0] ?? new Float32Array()
const captureLength = 3 * rate
const delay = Math.round(0.032 * rate)

const take = (change: (capture: Float32Array) => Float32Array) => {
  const capture = new Float32Array(captureLength)
  capture.set(source.subarray(0, captureLength - delay), delay)
  return change(capture)
}

// `seconds` of silence put in at `atSeconds` of the source.
const slip =
  (atSeconds: number, seconds: number) => (capture: Float32Array) => {
    const at = delay + Math.round(atSeconds * rate)
    const added = Math.round(seconds * rate)
    const result = new Float32Array(capture.length)
    result.set(capture.subarray(0, at))
    result.set(capture.subarray(at, capture.length - added), at + added)
    return result
  }

// The capture silent for `seconds` from `atSeconds` of the source, with
// what the file played meanwhile lost, and `lostSeconds` more besides, as
// a stall left each of three takes.
const stall =
  (atSeconds: number, seconds: number, lostSeconds: number) =>
  (capture: Float32Array) => {
    const at = delay + Math.round(atSeconds * rate)
    const silent = Math.round(seconds * rate)
    const result = new Float32Array(capture.length)
    result.set(capture.subarray(0, at))
    const resumed = capture.subarray(
      at + silent + Math.round(lostSeconds * rate),
    )
    result.set(resumed.subarray(0, capture.length - at - silent), at + silent)
    return result
  }

const silenceOf = (capture: Float32Array) =>
  deviceSilenceSeconds(capture, rate, source, rate)

describe('deviceSilenceSeconds', () => {
  test('is none for the voice as it is, whose own silence holds 27 ms of zeros', () => {
    expect(longestSilenceSeconds(source, rate)).toBeCloseTo(0.0267, 4)
    expect(silenceOf(take(capture => capture))).toBe(0)
  })

  test('is a slip of six buffers in voice, the largest seen, and no stall', () => {
    const silence = silenceOf(take(slip(0.8, 0.06)))
    expect(silence).toBeGreaterThan(0.06 - 0.03)
    expect(silence).toBeLessThanOrEqual(stallSeconds)
  })

  test("is a slip of six buffers in the voice's own silence, joining it, and no stall", () => {
    const silence = silenceOf(take(slip(1.14, 0.06)))
    expect(silence).toBeCloseTo(0.06, 3)
    expect(silence).toBeLessThanOrEqual(stallSeconds)
  })

  test('is a stall of 308 ms that lost 0.6 s, as one take measured', () => {
    const silence = silenceOf(take(stall(0.6, 0.308, 0.3)))
    expect(silence).toBeGreaterThan(stallSeconds)
  })

  test('is a stall of 268 ms, the shortest of the three seen', () => {
    const silence = silenceOf(take(stall(0.54, 0.268, 0.4)))
    expect(silence).toBeGreaterThan(stallSeconds)
  })

  test('is none for a capture that holds nothing', () => {
    expect(silenceOf(new Float32Array(captureLength))).toBe(0)
  })
})

describe('recordUnstalled', () => {
  test('records a stalled take again, and tells of the stall', async () => {
    const stalled = take(stall(0.6, 0.308, 0.3))
    const clean = take(capture => capture)
    const record = vi
      .fn<() => Promise<Float32Array>>()
      .mockResolvedValueOnce(stalled)
      .mockResolvedValueOnce(clean)
    const onStall = vi.fn()
    await expect(recordUnstalled(record, silenceOf, onStall)).resolves.toBe(
      clean,
    )
    expect(record).toHaveBeenCalledTimes(2)
    expect(onStall).toHaveBeenCalledOnce()
    expect(onStall.mock.calls[0]?.[0]).toMatchObject({ attempt: 1 })
  })

  test('keeps a take with a 60 ms slip, recording it once', async () => {
    const slipped = take(slip(1.14, 0.06))
    const record = vi.fn(() => Promise.resolve(slipped))
    const onStall = vi.fn()
    await expect(recordUnstalled(record, silenceOf, onStall)).resolves.toBe(
      slipped,
    )
    expect(record).toHaveBeenCalledOnce()
    expect(onStall).not.toHaveBeenCalled()
  })

  test('fails when every attempt stalled, naming each stall', async () => {
    const record = vi.fn(() => Promise.resolve(take(stall(0.6, 0.308, 0.3))))
    const onStall = vi.fn()
    await expect(recordUnstalled(record, silenceOf, onStall)).rejects.toThrow(
      /^Every one of 3 takes stalled, with (\d+\.\d ms, ){2}\d+\.\d ms of silence put in at once$/,
    )
    expect(record).toHaveBeenCalledTimes(attempts)
    expect(onStall.mock.calls.map(([stall]) => stall.attempt)).toStrictEqual([
      1, 2, 3,
    ])
  })
})
