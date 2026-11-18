import { describe, expect, test } from 'vitest'

import { frameRateJudgement, loadBound } from './frame-rate-judgement.ts'

// When the frame-rate test judges its bounds (docs/latency.md, "The frame
// rate"): on a desktop run whose machine is not loaded past half its CPUs,
// and never on CI, which only records.

describe('loadBound', () => {
  test('is half the CPU count: 6 on the 12 of the desktop that failed', () => {
    expect(loadBound(12)).toBe(6)
    expect(loadBound(11)).toBe(5.5)
  })
})

describe('frameRateJudgement', () => {
  test('judges a desktop run below the bound', () => {
    expect(
      frameRateJudgement({ ci: false, loadAverages: [2.14, 2.66], cpus: 12 }),
    ).toStrictEqual({ judged: true })
  })

  test('judges a desktop run at the bound itself', () => {
    expect(
      frameRateJudgement({ ci: false, loadAverages: [6, 6], cpus: 12 }),
    ).toStrictEqual({ judged: true })
  })

  test('records without judging on CI, whatever the load', () => {
    expect(
      frameRateJudgement({ ci: true, loadAverages: [0.5, 0.5], cpus: 4 }),
    ).toStrictEqual({ judged: false, reason: 'CI only records the frame rate' })
  })

  test('records without judging on a desktop loaded as the one that failed, at 9 on 12 CPUs', () => {
    expect(
      frameRateJudgement({ ci: false, loadAverages: [9, 2], cpus: 12 }),
    ).toStrictEqual({
      judged: false,
      reason:
        'the load average reached 9.00, above the bound of 6.00 for 12 CPUs',
    })
  })

  test('reads the larger load average, so a load that rose during the take counts', () => {
    expect(
      frameRateJudgement({ ci: false, loadAverages: [2, 16.04], cpus: 12 }),
    ).toStrictEqual({
      judged: false,
      reason:
        'the load average reached 16.04, above the bound of 6.00 for 12 CPUs',
    })
  })

  test('judges a desktop run whose load reads as zeros, as Windows gives, and says the load was not read', () => {
    expect(
      frameRateJudgement({ ci: false, loadAverages: [0, 0], cpus: 12 }),
    ).toStrictEqual({
      judged: true,
      loadUnread: 'the load average read 0, as on a system that keeps none',
    })
  })

  test('judges a desktop run that counts no CPUs, and says the load was not read', () => {
    expect(
      frameRateJudgement({ ci: false, loadAverages: [9, 9], cpus: 0 }),
    ).toStrictEqual({
      judged: true,
      loadUnread: 'the machine counted no CPUs, so the load has no bound',
    })
  })

  test('records without judging on CI even when the load is not read', () => {
    expect(
      frameRateJudgement({ ci: true, loadAverages: [0, 0], cpus: 0 }),
    ).toStrictEqual({ judged: false, reason: 'CI only records the frame rate' })
  })
})
