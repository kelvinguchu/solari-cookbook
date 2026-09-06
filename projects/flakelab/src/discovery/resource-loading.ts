import type {
  LoadingResourceType,
  ResourceLoadingDelayFault,
} from "../domain/schema.js"
import type { TrialExecutor } from "../runner/playwright-executor.js"
import type { ExperimentResult } from "./evaluate.js"
import { createCausalEvaluator } from "./evaluate.js"

const MINIMUM_CONFIRMATION_TRIALS = 12

export interface ResourceLoadingDiscoveryOptions {
  concurrency: number
  maximumDelayMs: number
  minimumFailureRate: number
  pattern: string
  resourceType: LoadingResourceType
  seed: number
  signal?: AbortSignal
  trials: number
}

export interface ResourceLoadingExperiment {
  delayMs: number
  result: ExperimentResult
}

export interface ResourceLoadingDiscoveryResult {
  baseline: ExperimentResult
  experiments: ResourceLoadingExperiment[]
  minimumDelayMs: number
  trigger: ResourceLoadingDelayFault
  triggerResult: ExperimentResult
}

async function confirmStableDelay(
  experiments: ResourceLoadingExperiment[],
  minimumDelayMs: number,
  evaluateDelay: (delayMs: number, trials?: number) => Promise<ExperimentResult>,
  confirmationTrials: number,
): Promise<{ delayMs: number; result: ExperimentResult }> {
  const candidates = [...new Set(experiments
    .filter((entry) => entry.delayMs >= minimumDelayMs && entry.result.confirmed)
    .map((entry) => entry.delayMs))]
    .sort((left, right) => left - right)
  for (const delayMs of candidates) {
    const result = await evaluateDelay(delayMs, confirmationTrials)
    if (result.confirmed) {
      return { delayMs, result }
    }
  }
  throw new Error("No resource loading delay reproduced the failure in two independent batches")
}

async function confirmReproducerDelay(
  minimumDelayMs: number,
  maximumDelayMs: number,
  evaluateDelay: (delayMs: number, trials?: number) => Promise<ExperimentResult>,
  confirmationTrials: number,
): Promise<{ delayMs: number; result: ExperimentResult }> {
  const delayMs = Math.ceil((minimumDelayMs + maximumDelayMs) / 2)
  const result = await evaluateDelay(delayMs, confirmationTrials)
  if (result.confirmed) {
    return { delayMs, result }
  }
  if (delayMs === maximumDelayMs) {
    throw new Error("No stable resource loading reproducer was found within the configured bound")
  }
  const maximumResult = await evaluateDelay(maximumDelayMs, confirmationTrials)
  if (!maximumResult.confirmed) {
    throw new Error("No stable resource loading reproducer was found within the configured bound")
  }
  return { delayMs: maximumDelayMs, result: maximumResult }
}

export async function discoverResourceLoadingDelay(
  execute: TrialExecutor,
  options: ResourceLoadingDiscoveryOptions,
): Promise<ResourceLoadingDiscoveryResult> {
  const common = {
    concurrency: options.concurrency,
    minimumFailureRate: options.minimumFailureRate,
    seed: options.seed,
    signal: options.signal,
    trials: options.trials,
  }
  const evaluator = createCausalEvaluator(execute, common)

  const experiments: ResourceLoadingExperiment[] = []
  const evaluateDelay = async (
    delayMs: number,
    trials = options.trials,
  ): Promise<ExperimentResult> => {
    const fault = {
      kind: "resource-loading-delay" as const,
      delayMs,
      pattern: options.pattern,
      resourceType: options.resourceType,
    }
    const result = await evaluator.evaluate([fault], trials)
    experiments.push({ delayMs, result })
    return result
  }

  const maximum = await evaluateDelay(options.maximumDelayMs)
  if (!maximum.confirmed) {
    throw new Error("Maximum resource loading delay did not reproduce the failure confidently")
  }

  let passingDelayMs = 0
  let failingDelayMs = options.maximumDelayMs
  while (failingDelayMs - passingDelayMs > 1) {
    const candidate = Math.floor((passingDelayMs + failingDelayMs) / 2)
    const result = await evaluateDelay(candidate)
    if (result.confirmed) {
      failingDelayMs = candidate
    } else {
      passingDelayMs = candidate
    }
  }
  const confirmationTrials = Math.max(options.trials, MINIMUM_CONFIRMATION_TRIALS)
  const minimum = await confirmStableDelay(
    experiments,
    failingDelayMs,
    evaluateDelay,
    confirmationTrials,
  )
  const stable = await confirmReproducerDelay(
    minimum.delayMs,
    options.maximumDelayMs,
    evaluateDelay,
    confirmationTrials,
  )
  return {
    baseline: evaluator.baseline(),
    experiments,
    minimumDelayMs: minimum.delayMs,
    trigger: {
      kind: "resource-loading-delay",
      delayMs: stable.delayMs,
      pattern: options.pattern,
      resourceType: options.resourceType,
    },
    triggerResult: stable.result,
  }
}
