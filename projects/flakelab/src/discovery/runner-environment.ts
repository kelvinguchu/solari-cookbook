import type {
  SharedStateInterferenceFault,
  WorkerPressureFault,
} from "../domain/schema.js"
import type { TrialExecutor } from "../runner/playwright-executor.js"
import type { ExperimentResult } from "./evaluate.js"
import { createCausalEvaluator } from "./evaluate.js"

const MINIMUM_CONFIRMATION_TRIALS = 12

interface RunnerDiscoveryOptions {
  concurrency: number
  minimumFailureRate: number
  pattern: string
  seed: number
  signal?: AbortSignal
  trials: number
}

export interface WorkerPressureDiscoveryOptions extends RunnerDiscoveryOptions {
  maximumWorkers: number
}

export interface SharedStateDiscoveryOptions extends RunnerDiscoveryOptions {
  maximumCopies: number
}

export interface RunnerDiscoveryResult<T extends WorkerPressureFault | SharedStateInterferenceFault> {
  baseline: ExperimentResult
  experiments: ExperimentResult[]
  trigger: T
  triggerResult: ExperimentResult
}

interface MinimumSearchOptions<T extends WorkerPressureFault | SharedStateInterferenceFault> {
  buildFault: (value: number) => T
  execute: TrialExecutor
  label: string
  maximum: number
  options: RunnerDiscoveryOptions
}

function validateMaximum(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 2 || value > 16) {
    throw new Error(`${label} must be an integer between 2 and 16`)
  }
}

async function discoverMinimum<T extends WorkerPressureFault | SharedStateInterferenceFault>(
  search: MinimumSearchOptions<T>,
): Promise<RunnerDiscoveryResult<T>> {
  const common = {
    concurrency: search.options.concurrency,
    minimumFailureRate: search.options.minimumFailureRate,
    seed: search.options.seed,
    signal: search.options.signal,
  }
  const evaluator = createCausalEvaluator(search.execute, {
    ...common,
    trials: search.options.trials,
  })
  const experiments: ExperimentResult[] = []
  let trigger: T | undefined
  for (let value = 2; value <= search.maximum; value += 1) {
    const candidate = search.buildFault(value)
    const result = await evaluator.evaluate([candidate])
    experiments.push(result)
    if (result.confirmed) {
      trigger = candidate
      break
    }
  }
  if (!trigger) {
    throw new Error(`${search.label} did not reproduce the failure confidently`)
  }
  const triggerResult = await evaluator.evaluate(
    [trigger],
    Math.max(search.options.trials, MINIMUM_CONFIRMATION_TRIALS),
  )
  experiments.push(triggerResult)
  if (!triggerResult.confirmed) {
    throw new Error(`${search.label} did not reproduce in an independent confirmation batch`)
  }
  return { baseline: evaluator.baseline(), experiments, trigger, triggerResult }
}

export function discoverWorkerPressure(
  execute: TrialExecutor,
  options: WorkerPressureDiscoveryOptions,
): Promise<RunnerDiscoveryResult<WorkerPressureFault>> {
  validateMaximum(options.maximumWorkers, "max-workers")
  return discoverMinimum({
    buildFault: (workers) => ({
      kind: "worker-pressure",
      pattern: options.pattern,
      workers,
    }),
    execute,
    label: "Worker pressure",
    maximum: options.maximumWorkers,
    options,
  })
}

export function discoverSharedStateInterference(
  execute: TrialExecutor,
  options: SharedStateDiscoveryOptions,
): Promise<RunnerDiscoveryResult<SharedStateInterferenceFault>> {
  validateMaximum(options.maximumCopies, "max-copies")
  return discoverMinimum({
    buildFault: (copies) => ({
      copies,
      kind: "shared-state-interference",
      pattern: options.pattern,
    }),
    execute,
    label: "Shared-state interference",
    maximum: options.maximumCopies,
    options,
  })
}
