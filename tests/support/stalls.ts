// Tells a fake-microphone take the machine stalled from one the device
// only slipped, and records a stalled take again (docs/fake-microphone.md,
// "When the machine stalls"), for the fake-microphone tests: plain maths on
// typed arrays for the check, and an asynchronous loop for the takes.
//
// A slip is the device putting one or a few 10 ms buffers of silence into
// the capture: exact zeros, less the resampler's ringing either side, 8.58
// ms for one buffer; the largest slip seen was six buffers, in 2,800 takes
// at load averages of 18 to 39. A stall is the machine stopping the audio
// path for most of a second: three browsers on three Playwright workers
// went silent in the same second, on a shared machine with 12 GB in swap
// 40 minutes later, each for several runs of exact zeros inside the voice,
// the longest 268, 308 and 328 ms, and each lost about 0.6 s of what the
// file played meanwhile, so no comparison can measure them.

// More silence than this in one run, past the source's own longest, is a
// stall: it is clear of the largest slip seen, 60 ms, by two buffers, and
// well below the shortest stall seen, 268 ms less the voice's own 27.
export const stallSeconds = 0.08

// The level, against the peak, past which the voice has started and
// before which it has ended: its leading and trailing silence are not
// searched.
const voiceLevel = 0.01

// The longest run of exact zeros between the first and last sample above
// `voiceLevel` of the peak, in seconds: 0 when nothing is that loud.
export const longestSilenceSeconds = (
  samples: Float32Array,
  sampleRate: number,
): number => {
  let peak = 0
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample))
  }
  const level = peak * voiceLevel
  let first = 0
  while (first < samples.length && Math.abs(samples[first] ?? 0) <= level) {
    first++
  }
  let last = samples.length - 1
  while (last > first && Math.abs(samples[last] ?? 0) <= level) {
    last--
  }
  let longest = 0
  let run = 0
  for (let i = first; i <= last; i++) {
    run = samples[i] === 0 ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  return longest / sampleRate
}

// How much longer the capture's longest silence inside the voice is than
// the source's own, as the most silence the device put in at once. The
// synthetic voices hold 21 to 27 ms of exact zeros between their voiced
// spans, which a slip there joins.
export const deviceSilenceSeconds = (
  capture: Float32Array,
  captureRate: number,
  source: Float32Array,
  sourceRate: number,
): number =>
  Math.max(
    0,
    longestSilenceSeconds(capture, captureRate) -
      longestSilenceSeconds(source, sourceRate),
  )

export type Stall = Readonly<{
  // Which attempt stalled, from 1.
  attempt: number
  silenceSeconds: number
}>

// A take is recorded once and up to twice again: the stalls seen all fell
// in one second, less than a take lasts, so the take after one runs clear
// of it, and a third stall in a row says the machine cannot run the test.
export const attempts = 3

// Records a take until one is not stalled, telling `onStall` of each that
// is, and fails naming each stall when every attempt stalled.
export const recordUnstalled = async <A>(
  record: () => Promise<A>,
  silenceOf: (take: A) => number,
  onStall: (stall: Stall) => void | Promise<void>,
): Promise<A> => {
  const stalls: Array<Stall> = []
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const take = await record()
    const silenceSeconds = silenceOf(take)
    if (silenceSeconds <= stallSeconds) {
      return take
    }
    const stall = { attempt, silenceSeconds }
    stalls.push(stall)
    await onStall(stall)
  }
  throw new Error(
    `Every one of ${attempts} takes stalled, with ${stalls
      .map(stall => `${(stall.silenceSeconds * 1000).toFixed(1)} ms`)
      .join(', ')} of silence put in at once`,
  )
}
