import type { AuthCookieExpiryFault } from "../domain/schema.js"
import type { TrialExecutor } from "../runner/playwright-executor.js"
import type { ExperimentResult } from "./evaluate.js"
import { createCausalEvaluator } from "./evaluate.js"

const MINIMUM_CONFIRMATION_TRIALS = 12

export interface AuthCookieDiscoveryOptions {
  concurrency: number
  cookieName: string
  minimumFailureRate: number
  pattern: string
  seed: number
  signal?: AbortSignal
  trials: number
}

export interface AuthCookieDiscoveryResult {
  baseline: ExperimentResult
  experiments: ExperimentResult[]
  trigger: AuthCookieExpiryFault
  triggerResult: ExperimentResult
}

export async function discoverAuthCookieExpiry(
  execute: TrialExecutor,
  options: AuthCookieDiscoveryOptions,
): Promise<AuthCookieDiscoveryResult> {
  const common = {
    concurrency: options.concurrency,
    minimumFailureRate: options.minimumFailureRate,
    seed: options.seed,
    signal: options.signal,
  }
  const evaluator = createCausalEvaluator(execute, { ...common, trials: options.trials })
  const trigger: AuthCookieExpiryFault = {
    kind: "auth-cookie-expiry",
    cookieName: options.cookieName,
    pattern: options.pattern,
  }
  const first = await evaluator.evaluate([trigger])
  if (!first.confirmed) {
    throw new Error("Auth cookie expiry did not reproduce the failure confidently")
  }
  const triggerResult = await evaluator.evaluate(
    [trigger],
    Math.max(options.trials, MINIMUM_CONFIRMATION_TRIALS),
  )
  if (!triggerResult.confirmed) {
    throw new Error("Auth cookie expiry did not reproduce in an independent confirmation batch")
  }
  return { baseline: evaluator.baseline(), experiments: [first, triggerResult], trigger, triggerResult }
}
