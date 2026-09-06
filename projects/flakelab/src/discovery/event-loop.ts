import type { EventLoopStallFault } from "../domain/schema.js"
import type { TrialExecutor } from "../runner/playwright-executor.js"
import type { ExperimentResult } from "./evaluate.js"
import { createCausalEvaluator } from "./evaluate.js"

const MINIMUM_CONFIRMATION_TRIALS = 12

export interface EventLoopDiscoveryOptions {
  concurrency: number
  maximumDurationMs: number
  minimumFailureRate: number
  pattern: string
  seed: number
  signal?: AbortSignal
  startAfterMs: number
  trials: number
}

export interface EventLoopExperiment {
  durationMs: number
  result: ExperimentResult
}

export interface EventLoopDiscoveryResult {
  baseline: ExperimentResult
  experiments: EventLoopExperiment[]
  minimumDurationMs: number
  trigger: EventLoopStallFault
  triggerResult: ExperimentResult
}

async function confirmBoundary(
  experiments: EventLoopExperiment[],
  minimumDurationMs: number,
  evaluateDuration: (durationMs: number, trials?: number) => Promise<ExperimentResult>,
  confirmationTrials: number,
): Promise<{ durationMs: number; result: ExperimentResult }> {
  const candidates = [...new Set(experiments
    .filter((entry) => entry.durationMs >= minimumDurationMs && entry.result.confirmed)
    .map((entry) => entry.durationMs))]
    .sort((left, right) => left - right)
  for (const durationMs of candidates) {
    const result = await evaluateDuration(durationMs, confirmationTrials)
    if (result.confirmed) {
      return { durationMs, result }
    }
  }
  throw new Error("No event-loop stall reproduced the failure in two independent batches")
}

async function confirmStableTrigger(
  minimumDurationMs: number,
  maximumDurationMs: number,
  evaluateDuration: (durationMs: number, trials?: number) => Promise<ExperimentResult>,
  confirmationTrials: number,
): Promise<{ durationMs: number; result: ExperimentResult }> {
  const durationMs = Math.ceil((minimumDurationMs + maximumDurationMs) / 2)
  const result = await evaluateDuration(durationMs, confirmationTrials)
  if (result.confirmed) {
    return { durationMs, result }
  }
  if (durationMs === maximumDurationMs) {
    throw new Error("No stable event-loop stall reproducer was found within the configured bound")
  }
  const maximumResult = await evaluateDuration(maximumDurationMs, confirmationTrials)
  if (!maximumResult.confirmed) {
    throw new Error("No stable event-loop stall reproducer was found within the configured bound")
  }
  return { durationMs: maximumDurationMs, result: maximumResult }
}

export async function discoverEventLoopStall(
  execute: TrialExecutor,
  options: EventLoopDiscoveryOptions,
): Promise<EventLoopDiscoveryResult> {
  const common = {
    concurrency: options.concurrency,
    minimumFailureRate: options.minimumFailureRate,
    seed: options.seed,
    signal: options.signal,
    trials: options.trials,
  }
  const evaluator = createCausalEvaluator(execute, common)

  const experiments: EventLoopExperiment[] = []
  const evaluateDuration = async (
    durationMs: number,
    trials = options.trials,
  ): Promise<ExperimentResult> => {
    const fault = {
      kind: "event-loop-stall" as const,
      durationMs,
      pattern: options.pattern,
      startAfterMs: options.startAfterMs,
    }
    const result = await evaluator.evaluate([fault], trials)
    experiments.push({ durationMs, result })
    return result
  }

  const maximum = await evaluateDuration(options.maximumDurationMs)
  if (!maximum.confirmed) {
    throw new Error("Maximum event-loop stall did not reproduce the failure confidently")
  }

  let passingDurationMs = 0
  let failingDurationMs = options.maximumDurationMs
  while (failingDurationMs - passingDurationMs > 1) {
    const candidate = Math.floor((passingDurationMs + failingDurationMs) / 2)
    const result = await evaluateDuration(candidate)
    if (result.confirmed) {
      failingDurationMs = candidate
    } else {
      passingDurationMs = candidate
    }
  }
  const confirmationTrials = Math.max(options.trials, MINIMUM_CONFIRMATION_TRIALS)
  const minimum = await confirmBoundary(
    experiments,
    failingDurationMs,
    evaluateDuration,
    confirmationTrials,
  )
  const stable = await confirmStableTrigger(
    minimum.durationMs,
    options.maximumDurationMs,
    evaluateDuration,
    confirmationTrials,
  )
  return {
    baseline: evaluator.baseline(),
    experiments,
    minimumDurationMs: minimum.durationMs,
    trigger: {
      kind: "event-loop-stall",
      durationMs: stable.durationMs,
      pattern: options.pattern,
      startAfterMs: options.startAfterMs,
    },
    triggerResult: stable.result,
  }
}
