import { writeFile } from "node:fs/promises"
import { basename, dirname, extname, resolve } from "node:path"

import type {
  DelayDiscoveryResult,
  DuplicationDiscoveryResult,
  ReorderingDiscoveryResult,
  TruncationDiscoveryResult,
} from "../discovery/minimize.js"
import type { AuthCookieDiscoveryResult } from "../discovery/auth-cookie.js"
import { discoverAuthCookieExpiry } from "../discovery/auth-cookie.js"
import type { EventLoopDiscoveryResult } from "../discovery/event-loop.js"
import { discoverEventLoopStall } from "../discovery/event-loop.js"
import {
  discoverNetworkDelay,
  discoverResponseDuplication,
  discoverResponseReordering,
  discoverResponseTruncation,
  networkDelayTrialBound,
} from "../discovery/minimize.js"
import type { ResourceLoadingDiscoveryResult } from "../discovery/resource-loading.js"
import { discoverResourceLoadingDelay } from "../discovery/resource-loading.js"
import type { StartupEventDiscoveryResult } from "../discovery/startup-event.js"
import { discoverStartupEventDelay } from "../discovery/startup-event.js"
import type { StorageStateDiscoveryResult } from "../discovery/storage-state.js"
import { discoverStorageStateDelay } from "../discovery/storage-state.js"
import type { TemporalDiscoveryResult } from "../discovery/temporal-environment.js"
import {
  discoverClockJump,
  discoverLocale,
  discoverTimezone,
} from "../discovery/temporal-environment.js"
import type { VisualDiscoveryResult } from "../discovery/visual-environment.js"
import {
  discoverAnimationSpeed,
  discoverReducedMotion,
  discoverViewport,
} from "../discovery/visual-environment.js"
import type { RunnerDiscoveryResult } from "../discovery/runner-environment.js"
import {
  discoverSharedStateInterference,
  discoverWorkerPressure,
} from "../discovery/runner-environment.js"
import type { ExperimentResult } from "../discovery/evaluate.js"
import type { Fault } from "../domain/schema.js"
import {
  browserStorageAreaSchema,
  browserStorageKeySchema,
  cookieNameSchema,
  loadingResourceTypeSchema,
  localeSchema,
  startupEventSchema,
  timeZoneSchema,
} from "../domain/schema.js"
import { writeReproducer } from "../reproducer/file.js"
import type { Reproducer } from "../reproducer/schema.js"
import { createPlaywrightExecutor } from "../runner/playwright-executor.js"
import type { TrialExecutor } from "../runner/playwright-executor.js"
import { formatSeconds } from "../ui/format.js"
import { ProgressReporter } from "../ui/progress.js"
import { TrialProgress } from "../ui/trial-progress.js"
import type { DiscoverOptions } from "./options.js"
import { integerOption, positiveNumberOption, rateOption, withInterruption } from "./options.js"

export type DiscoveryResult =
  | AuthCookieDiscoveryResult
  | DelayDiscoveryResult
  | DuplicationDiscoveryResult
  | EventLoopDiscoveryResult
  | ReorderingDiscoveryResult
  | ResourceLoadingDiscoveryResult
  | StartupEventDiscoveryResult
  | StorageStateDiscoveryResult
  | TemporalDiscoveryResult<Fault>
  | TruncationDiscoveryResult
  | VisualDiscoveryResult<Fault>
  | RunnerDiscoveryResult<Extract<Fault, {
    kind: "shared-state-interference" | "worker-pressure"
  }>>

interface CommonDiscoveryOptions {
  concurrency: number
  minimumFailureRate: number
  pattern: string
  seed: number
  signal: AbortSignal
  trials: number
}

function requiredFaultOption(value: string | undefined, option: string, fault: string): string {
  if (!value) {
    throw new Error(`${fault} requires --${option} <value>`)
  }
  return value
}

export function buildDiscoveredReproducer(
  test: string,
  seed: number,
  minimumRate: number,
  trigger: Fault,
  triggerResult: ExperimentResult,
): Reproducer {
  return {
    test,
    seed,
    trials: triggerResult.trials,
    faults: [trigger],
    expectedFailure: {
      minimumRate,
      ...(triggerResult.dominantFailureSignature
        ? { signature: triggerResult.dominantFailureSignature }
        : {}),
    },
  }
}

async function runEnvironmentDiscovery(
  execute: TrialExecutor,
  values: DiscoverOptions,
  common: CommonDiscoveryOptions,
): Promise<DiscoveryResult | undefined> {
  if (values.fault === "animation-speed") {
    return discoverAnimationSpeed(execute, {
      ...common,
      rate: positiveNumberOption(values["animation-rate"], "animation-rate"),
    })
  }
  if (values.fault === "auth-cookie-expiry") {
    return discoverAuthCookieExpiry(execute, {
      ...common,
      cookieName: cookieNameSchema.parse(requiredFaultOption(
        values["cookie-name"], "cookie-name", "auth-cookie-expiry",
      )),
    })
  }
  if (values.fault === "clock-jump") {
    return discoverClockJump(execute, {
      ...common,
      jumpAfterMs: integerOption(values["jump-after-ms"], "jump-after-ms"),
      offsetMs: integerOption(values["clock-offset-ms"], "clock-offset-ms"),
    })
  }
  if (values.fault === "event-loop-stall") {
    return discoverEventLoopStall(execute, {
      ...common,
      maximumDurationMs: integerOption(values["max-stall-ms"], "max-stall-ms"),
      startAfterMs: integerOption(values["stall-after-ms"], "stall-after-ms"),
    })
  }
  if (values.fault === "locale") {
    return discoverLocale(execute, { ...common, locale: localeSchema.parse(values.locale) })
  }
  if (values.fault === "reduced-motion") {
    return discoverReducedMotion(execute, common)
  }
  if (values.fault === "storage-state-delay") {
    return discoverStorageStateDelay(execute, {
      ...common,
      key: browserStorageKeySchema.parse(requiredFaultOption(
        values["storage-key"], "storage-key", "storage-state-delay",
      )),
      maximumDelayMs: integerOption(values["max-delay"], "max-delay"),
      storage: browserStorageAreaSchema.parse(values.storage),
    })
  }
  if (values.fault === "timezone") {
    return discoverTimezone(execute, {
      ...common,
      timezoneId: timeZoneSchema.parse(values.timezone),
    })
  }
  if (values.fault === "viewport") {
    return discoverViewport(execute, {
      ...common,
      height: integerOption(values["viewport-height"], "viewport-height"),
      width: integerOption(values["viewport-width"], "viewport-width"),
    })
  }
  return undefined
}

async function runRunnerDiscovery(
  execute: TrialExecutor,
  selector: string,
  values: DiscoverOptions,
  common: CommonDiscoveryOptions,
): Promise<DiscoveryResult | undefined> {
  if (values.fault === "shared-state-interference") {
    return discoverSharedStateInterference(execute, {
      ...common,
      maximumCopies: integerOption(values["max-copies"], "max-copies"),
      pattern: selector,
    })
  }
  if (values.fault === "worker-pressure") {
    return discoverWorkerPressure(execute, {
      ...common,
      maximumWorkers: integerOption(values["max-workers"], "max-workers"),
      pattern: selector,
    })
  }
  return undefined
}

/**
 * Reports one line per completed trial: the running count, the outcome, how long
 * the trial took, and how much of the elapsed-time budget remains. Nothing else
 * about an individual trial reaches the terminal.
 */
function countedExecutor(
  executeTrial: TrialExecutor,
  progress: TrialProgress,
): TrialExecutor {
  return async (trial) => {
    const outcome = await executeTrial(trial)
    progress.trial(outcome.status, outcome.durationMs)
    return outcome
  }
}

async function runDiscovery(
  selector: string,
  values: DiscoverOptions,
  progress: TrialProgress,
  signal: AbortSignal,
): Promise<DiscoveryResult> {
  const common = {
    concurrency: integerOption(values.concurrency, "concurrency"),
    minimumFailureRate: rateOption(values["min-rate"]),
    pattern: values.pattern,
    seed: integerOption(values.seed, "seed"),
    signal,
    trials: integerOption(values.trials, "trials"),
  }
  const executeTrial = createPlaywrightExecutor(process.cwd(), selector, { signal })
  const execute = countedExecutor(executeTrial, progress)
  const runnerResult = await runRunnerDiscovery(execute, selector, values, common)
  if (runnerResult) {
    return runnerResult
  }
  const environmentResult = await runEnvironmentDiscovery(execute, values, common)
  if (environmentResult) {
    return environmentResult
  }
  if (values.fault === "network-delay") {
    return discoverNetworkDelay(execute, {
      ...common,
      maximumDelayMs: integerOption(values["max-delay"], "max-delay"),
    })
  }
  if (values.fault === "response-truncation") {
    return discoverResponseTruncation(execute, {
      ...common,
      maximumRemoveBytes: integerOption(values["max-remove-bytes"], "max-remove-bytes"),
    })
  }
  if (values.fault === "response-duplication") {
    return discoverResponseDuplication(execute, {
      ...common,
      maximumDuplicateBytes: integerOption(
        values["max-duplicate-bytes"],
        "max-duplicate-bytes",
      ),
    })
  }
  if (values.fault === "response-reordering") {
    return discoverResponseReordering(execute, {
      ...common,
      maximumHoldMs: integerOption(values["max-hold-ms"], "max-hold-ms"),
    })
  }
  if (values.fault === "resource-loading-delay") {
    return discoverResourceLoadingDelay(execute, {
      ...common,
      maximumDelayMs: integerOption(values["max-delay"], "max-delay"),
      resourceType: loadingResourceTypeSchema.parse(values["resource-type"]),
    })
  }
  if (values.fault === "startup-event-delay") {
    return discoverStartupEventDelay(execute, {
      ...common,
      event: startupEventSchema.parse(values["startup-event"]),
      maximumDelayMs: integerOption(values["max-delay"], "max-delay"),
    })
  }
  throw new Error(
    "fault must be animation-speed, auth-cookie-expiry, clock-jump, event-loop-stall, locale, network-delay, reduced-motion, resource-loading-delay, response-duplication, response-reordering, response-truncation, shared-state-interference, startup-event-delay, storage-state-delay, timezone, viewport, or worker-pressure",
  )
}

function describeTrigger(result: DiscoveryResult): string {
  const parts: string[] = [result.trigger.kind]
  if ("minimumDelayMs" in result) {
    parts.push(`minimum delay ${result.minimumDelayMs} ms`)
  }
  if ("minimumDurationMs" in result) {
    parts.push(`minimum duration ${result.minimumDurationMs} ms`)
  }
  const observed = result.triggerResult
  parts.push(`${observed.failed}/${observed.trials} failures confirmed`)
  return parts.join(" · ")
}

async function runBoundedDiscovery(
  selector: string,
  values: DiscoverOptions,
  progress: TrialProgress,
  maxSeconds: number,
): Promise<DiscoveryResult> {
  return withInterruption(
    async (signal) => runDiscovery(selector, values, progress, signal),
    {
      maxSeconds,
      timeoutMessage: `Discovery stopped after reaching --max-seconds ${maxSeconds}`,
    },
  )
}

async function reportedDiscovery(
  selector: string,
  values: DiscoverOptions,
  progress: TrialProgress,
  maxSeconds: number,
  plannedTrials: number | undefined,
  reporter: ProgressReporter,
): Promise<DiscoveryResult> {
  try {
    return await runBoundedDiscovery(selector, values, progress, maxSeconds)
  } catch (error) {
    const timedOut = error instanceof Error && error.message.includes("--max-seconds")
    reporter.fail(discoveryFailureDetail(timedOut, progress.completed, plannedTrials))
    throw error
  }
}

export function discoveryFailureDetail(
  timedOut: boolean,
  completedTrials: number,
  plannedTrials: number | undefined,
): string {
  if (!timedOut) {
    return `no confirmed trigger · ${completedTrials} trials`
  }
  const progress = plannedTrials === undefined
    ? `${completedTrials} trials`
    : `${completedTrials} of ${plannedTrials} planned trials`
  return `incomplete · ${progress}`
}

function plannedDiscoveryTrials(values: DiscoverOptions): number | undefined {
  if (values.fault !== "network-delay") {
    return undefined
  }
  return networkDelayTrialBound(
    integerOption(values.trials, "trials"),
    integerOption(values["max-delay"], "max-delay"),
  )
}

export async function discover(selector: string, values: DiscoverOptions): Promise<DiscoveryResult> {
  const projectRoot = process.cwd()
  const outputPath = resolve(projectRoot, values.output)
  const seed = integerOption(values.seed, "seed")
  const minimumFailureRate = rateOption(values["min-rate"])
  const maxSeconds = positiveNumberOption(values["max-seconds"], "max-seconds")
  const reporter = new ProgressReporter()
  reporter.start(
    `discovery · ${values.fault}`,
    `bounded to ${formatSeconds(maxSeconds)} · stable triggers receive a 12-trial confirmation`,
  )
  const progress = new TrialProgress(reporter, maxSeconds)
  const result = await reportedDiscovery(
    selector,
    values,
    progress,
    maxSeconds,
    plannedDiscoveryTrials(values),
    reporter,
  )
  reporter.done(`${describeTrigger(result)} · ${progress.completed} trials`)
  await writeReproducer(outputPath, buildDiscoveredReproducer(
    selector,
    seed,
    minimumFailureRate,
    result.trigger,
    result.triggerResult,
  ))
  const discoveryPath = resolve(
    dirname(outputPath),
    `${basename(outputPath, extname(outputPath))}.discovery.json`,
  )
  await writeFile(discoveryPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8" })
  console.log(JSON.stringify({
    baseline: result.baseline,
    experiments: result.experiments.length,
    ...("minimumDelayMs" in result ? { minimumDelayMs: result.minimumDelayMs } : {}),
    ...("minimumDurationMs" in result ? { minimumDurationMs: result.minimumDurationMs } : {}),
    reproducerPath: outputPath,
    discoveryPath,
    trigger: result.trigger,
    triggerResult: result.triggerResult,
  }, null, 2))
  return result
}
