import type {
  NetworkDelayFault,
  ResponseDuplicationFault,
  ResponseReorderingFault,
  ResponseTruncationFault,
} from "../domain/schema.js"
import type { TrialExecutor } from "../runner/playwright-executor.js"
import type { ExperimentResult } from "./evaluate.js"
import { createCausalEvaluator } from "./evaluate.js"

const MINIMUM_CONFIRMATION_TRIALS = 12

export function networkDelayTrialBound(trials: number, maximumDelayMs: number): number {
  const interventionBatches = 1 + Math.ceil(Math.log2(Math.max(1, maximumDelayMs)))
  return 2 * (trials * interventionBatches + Math.max(trials, MINIMUM_CONFIRMATION_TRIALS))
}

export interface DelayDiscoveryOptions {
  concurrency: number
  maximumDelayMs: number
  minimumFailureRate: number
  pattern: string
  seed: number
  signal?: AbortSignal
  trials: number
}

export interface DelayExperiment {
  delayMs: number
  result: ExperimentResult
}

export interface DelayDiscoveryResult {
  baseline: ExperimentResult
  experiments: DelayExperiment[]
  trigger: NetworkDelayFault
  triggerResult: ExperimentResult
}

export interface TruncationDiscoveryOptions {
  concurrency: number
  maximumRemoveBytes: number
  minimumFailureRate: number
  pattern: string
  seed: number
  signal?: AbortSignal
  trials: number
}

export interface TruncationExperiment {
  removeBytes: number
  result: ExperimentResult
}

export interface TruncationDiscoveryResult {
  baseline: ExperimentResult
  experiments: TruncationExperiment[]
  trigger: ResponseTruncationFault
  triggerResult: ExperimentResult
}

export interface DuplicationDiscoveryOptions {
  concurrency: number
  maximumDuplicateBytes: number
  minimumFailureRate: number
  pattern: string
  seed: number
  signal?: AbortSignal
  trials: number
}

export interface DuplicationExperiment {
  duplicateBytes: number
  result: ExperimentResult
}

export interface DuplicationDiscoveryResult {
  baseline: ExperimentResult
  experiments: DuplicationExperiment[]
  trigger: ResponseDuplicationFault
  triggerResult: ExperimentResult
}

export interface ReorderingDiscoveryOptions {
  concurrency: number
  maximumHoldMs: number
  minimumFailureRate: number
  pattern: string
  seed: number
  signal?: AbortSignal
  trials: number
}

export interface ReorderingExperiment {
  holdMs: number
  result: ExperimentResult
}

export interface ReorderingDiscoveryResult {
  baseline: ExperimentResult
  experiments: ReorderingExperiment[]
  trigger: ResponseReorderingFault
  triggerResult: ExperimentResult
}

async function confirmStableDelay(
  experiments: DelayExperiment[],
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
  throw new Error("No network delay reproduced the failure in two independent trial batches")
}

export async function minimizeItems<T>(
  values: readonly T[],
  reproduces: (candidate: readonly T[]) => Promise<boolean>,
): Promise<T[]> {
  let minimal = [...values]
  let index = 0
  while (index < minimal.length) {
    const candidate = minimal.filter((_value, candidateIndex) => candidateIndex !== index)
    if (candidate.length > 0 && await reproduces(candidate)) {
      minimal = candidate
    } else {
      index += 1
    }
  }
  return minimal
}

export async function discoverNetworkDelay(
  execute: TrialExecutor,
  options: DelayDiscoveryOptions,
): Promise<DelayDiscoveryResult> {
  const common = {
    concurrency: options.concurrency,
    minimumFailureRate: options.minimumFailureRate,
    seed: options.seed,
    signal: options.signal,
    trials: options.trials,
  }
  const evaluator = createCausalEvaluator(execute, common)

  const experiments: DelayExperiment[] = []
  const evaluateDelay = async (
    delayMs: number,
    trials = options.trials,
  ): Promise<ExperimentResult> => {
    const fault = { kind: "network-delay" as const, pattern: options.pattern, delayMs }
    const result = await evaluator.evaluate([fault], trials)
    experiments.push({ delayMs, result })
    return result
  }

  const maximum = await evaluateDelay(options.maximumDelayMs)
  if (!maximum.confirmed) {
    throw new Error("Maximum network delay did not reproduce the failure confidently")
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
  const stable = await confirmStableDelay(
    experiments,
    failingDelayMs,
    evaluateDelay,
    Math.max(options.trials, MINIMUM_CONFIRMATION_TRIALS),
  )
  return {
    baseline: evaluator.baseline(),
    experiments,
    trigger: { kind: "network-delay", pattern: options.pattern, delayMs: stable.delayMs },
    triggerResult: stable.result,
  }
}

async function confirmStableTruncation(
  experiments: TruncationExperiment[],
  minimumRemoveBytes: number,
  evaluateRemoval: (removeBytes: number, trials?: number) => Promise<ExperimentResult>,
  confirmationTrials: number,
): Promise<{ removeBytes: number; result: ExperimentResult }> {
  const candidates = [...new Set(experiments
    .filter((entry) => entry.removeBytes >= minimumRemoveBytes && entry.result.confirmed)
    .map((entry) => entry.removeBytes))]
    .sort((left, right) => left - right)
  for (const removeBytes of candidates) {
    const result = await evaluateRemoval(removeBytes, confirmationTrials)
    if (result.confirmed) {
      return { removeBytes, result }
    }
  }
  throw new Error("No response truncation reproduced the failure in two independent trial batches")
}

export async function discoverResponseTruncation(
  execute: TrialExecutor,
  options: TruncationDiscoveryOptions,
): Promise<TruncationDiscoveryResult> {
  const common = {
    concurrency: options.concurrency,
    minimumFailureRate: options.minimumFailureRate,
    seed: options.seed,
    signal: options.signal,
    trials: options.trials,
  }
  const evaluator = createCausalEvaluator(execute, common)

  const experiments: TruncationExperiment[] = []
  const evaluateRemoval = async (
    removeBytes: number,
    trials = options.trials,
  ): Promise<ExperimentResult> => {
    const fault = {
      kind: "response-truncation" as const,
      pattern: options.pattern,
      removeBytes,
    }
    const result = await evaluator.evaluate([fault], trials)
    experiments.push({ removeBytes, result })
    return result
  }

  const maximum = await evaluateRemoval(options.maximumRemoveBytes)
  if (!maximum.confirmed) {
    throw new Error("Maximum response truncation did not reproduce the failure confidently")
  }

  let passingRemoveBytes = 0
  let failingRemoveBytes = options.maximumRemoveBytes
  while (failingRemoveBytes - passingRemoveBytes > 1) {
    const candidate = Math.floor((passingRemoveBytes + failingRemoveBytes) / 2)
    const result = await evaluateRemoval(candidate)
    if (result.confirmed) {
      failingRemoveBytes = candidate
    } else {
      passingRemoveBytes = candidate
    }
  }
  const stable = await confirmStableTruncation(
    experiments,
    failingRemoveBytes,
    evaluateRemoval,
    Math.max(options.trials, MINIMUM_CONFIRMATION_TRIALS),
  )
  return {
    baseline: evaluator.baseline(),
    experiments,
    trigger: {
      kind: "response-truncation",
      pattern: options.pattern,
      removeBytes: stable.removeBytes,
    },
    triggerResult: stable.result,
  }
}

async function confirmStableDuplication(
  experiments: DuplicationExperiment[],
  minimumDuplicateBytes: number,
  evaluateDuplication: (duplicateBytes: number, trials?: number) => Promise<ExperimentResult>,
  confirmationTrials: number,
): Promise<{ duplicateBytes: number; result: ExperimentResult }> {
  const candidates = [...new Set(experiments
    .filter((entry) => entry.duplicateBytes >= minimumDuplicateBytes && entry.result.confirmed)
    .map((entry) => entry.duplicateBytes))]
    .sort((left, right) => left - right)
  for (const duplicateBytes of candidates) {
    const result = await evaluateDuplication(duplicateBytes, confirmationTrials)
    if (result.confirmed) {
      return { duplicateBytes, result }
    }
  }
  throw new Error("No response duplication reproduced the failure in two independent trial batches")
}

export async function discoverResponseDuplication(
  execute: TrialExecutor,
  options: DuplicationDiscoveryOptions,
): Promise<DuplicationDiscoveryResult> {
  const common = {
    concurrency: options.concurrency,
    minimumFailureRate: options.minimumFailureRate,
    seed: options.seed,
    signal: options.signal,
    trials: options.trials,
  }
  const evaluator = createCausalEvaluator(execute, common)

  const experiments: DuplicationExperiment[] = []
  const evaluateDuplication = async (
    duplicateBytes: number,
    trials = options.trials,
  ): Promise<ExperimentResult> => {
    const fault = {
      kind: "response-duplication" as const,
      pattern: options.pattern,
      duplicateBytes,
    }
    const result = await evaluator.evaluate([fault], trials)
    experiments.push({ duplicateBytes, result })
    return result
  }

  const maximum = await evaluateDuplication(options.maximumDuplicateBytes)
  if (!maximum.confirmed) {
    throw new Error("Maximum response duplication did not reproduce the failure confidently")
  }

  let passingDuplicateBytes = 0
  let failingDuplicateBytes = options.maximumDuplicateBytes
  while (failingDuplicateBytes - passingDuplicateBytes > 1) {
    const candidate = Math.floor((passingDuplicateBytes + failingDuplicateBytes) / 2)
    const result = await evaluateDuplication(candidate)
    if (result.confirmed) {
      failingDuplicateBytes = candidate
    } else {
      passingDuplicateBytes = candidate
    }
  }
  const stable = await confirmStableDuplication(
    experiments,
    failingDuplicateBytes,
    evaluateDuplication,
    Math.max(options.trials, MINIMUM_CONFIRMATION_TRIALS),
  )
  return {
    baseline: evaluator.baseline(),
    experiments,
    trigger: {
      kind: "response-duplication",
      pattern: options.pattern,
      duplicateBytes: stable.duplicateBytes,
    },
    triggerResult: stable.result,
  }
}

async function confirmStableReordering(
  experiments: ReorderingExperiment[],
  minimumHoldMs: number,
  evaluateHold: (holdMs: number, trials?: number) => Promise<ExperimentResult>,
  confirmationTrials: number,
): Promise<{ holdMs: number; result: ExperimentResult }> {
  const candidates = [...new Set(experiments
    .filter((entry) => entry.holdMs >= minimumHoldMs && entry.result.confirmed)
    .map((entry) => entry.holdMs))]
    .sort((left, right) => left - right)
  for (const holdMs of candidates) {
    const result = await evaluateHold(holdMs, confirmationTrials)
    if (result.confirmed) {
      return { holdMs, result }
    }
  }
  throw new Error("No response reordering reproduced the failure in two independent trial batches")
}

export async function discoverResponseReordering(
  execute: TrialExecutor,
  options: ReorderingDiscoveryOptions,
): Promise<ReorderingDiscoveryResult> {
  const common = {
    concurrency: options.concurrency,
    minimumFailureRate: options.minimumFailureRate,
    seed: options.seed,
    signal: options.signal,
    trials: options.trials,
  }
  const evaluator = createCausalEvaluator(execute, common)

  const experiments: ReorderingExperiment[] = []
  const evaluateHold = async (
    holdMs: number,
    trials = options.trials,
  ): Promise<ExperimentResult> => {
    const fault = { kind: "response-reordering" as const, pattern: options.pattern, holdMs }
    const result = await evaluator.evaluate([fault], trials)
    experiments.push({ holdMs, result })
    return result
  }

  const maximum = await evaluateHold(options.maximumHoldMs)
  if (!maximum.confirmed) {
    throw new Error("Maximum response hold did not reproduce the failure confidently")
  }

  let passingHoldMs = 0
  let failingHoldMs = options.maximumHoldMs
  while (failingHoldMs - passingHoldMs > 1) {
    const candidate = Math.floor((passingHoldMs + failingHoldMs) / 2)
    const result = await evaluateHold(candidate)
    if (result.confirmed) {
      failingHoldMs = candidate
    } else {
      passingHoldMs = candidate
    }
  }
  const stable = await confirmStableReordering(
    experiments,
    failingHoldMs,
    evaluateHold,
    Math.max(options.trials, MINIMUM_CONFIRMATION_TRIALS),
  )
  return {
    baseline: evaluator.baseline(),
    experiments,
    trigger: { kind: "response-reordering", pattern: options.pattern, holdMs: stable.holdMs },
    triggerResult: stable.result,
  }
}
