// Whether the frame-rate test judges its bounds or only records its
// numbers (docs/latency.md, "The frame rate"): it judges a desktop run,
// by Daniel's choice, unless the machine is loaded past what a judgement
// can bear, and never CI's runner, a shared virtual machine.
//
// The bound is half the CPU count. On one 12-CPU desktop the test held
// 60.00 frames a second with no long frame at load averages of 2.1 to
// 3.7, its own browser and server included, and failed (55.7 and 58.6
// frames a second, up to 25 long frames of whole missed refreshes) at 9
// to 16 from other sessions; half of 12, 6, sits between the two.

// The load average past which a desktop run records without judging.
export const loadBound = (cpus: number): number => cpus / 2

// A judged run whose load could not be read says why in `loadUnread`: it
// is judged as every desktop run was before the load counted.
export type FrameRateJudgement =
  | { readonly judged: true; readonly loadUnread?: string }
  | { readonly judged: false; readonly reason: string }

// `loadAverages` are the machine's one-minute load averages read as the
// take starts and as it ends: the larger is judged against the bound, so
// a load that rose or fell during the take counts.
export const frameRateJudgement = ({
  ci,
  loadAverages,
  cpus,
}: {
  readonly ci: boolean
  readonly loadAverages: readonly [atStart: number, atEnd: number]
  readonly cpus: number
}): FrameRateJudgement => {
  if (ci) {
    return { judged: false, reason: 'CI only records the frame rate' }
  }
  // Node's `os.cpus()` is empty where the system does not say, so there
  // is nothing to bound the load by.
  if (cpus === 0) {
    return {
      judged: true,
      loadUnread: 'the machine counted no CPUs, so the load has no bound',
    }
  }
  const load = Math.max(...loadAverages)
  // Node's `os.loadavg()` gives zeros on Windows, which keeps no load
  // average; a machine running the test's own browser is never at 0.
  if (load === 0) {
    return {
      judged: true,
      loadUnread: 'the load average read 0, as on a system that keeps none',
    }
  }
  const bound = loadBound(cpus)
  if (load > bound) {
    return {
      judged: false,
      reason: `the load average reached ${load.toFixed(2)}, above the bound of ${bound.toFixed(2)} for ${cpus} CPUs`,
    }
  }
  return { judged: true }
}
