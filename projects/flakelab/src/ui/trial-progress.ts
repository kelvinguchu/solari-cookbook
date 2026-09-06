import { formatDuration, formatSeconds } from "./format.js"
import type { ProgressReporter } from "./progress.js"

/**
 * Trial-level progress for long causal searches. One line per completed trial
 * carries the running count, the outcome, the trial duration, the pass/fail
 * split so far, and how much of the elapsed-time budget is spent. Individual
 * fault installations, browser launches, and retries stay silent.
 */
export class TrialProgress {
  #errored = 0
  #failed = 0
  #passed = 0
  readonly #budgetSeconds: number
  readonly #reporter: ProgressReporter
  readonly #startedAt = Date.now()

  constructor(reporter: ProgressReporter, budgetSeconds: number) {
    this.#budgetSeconds = budgetSeconds
    this.#reporter = reporter
  }

  get completed(): number {
    return this.#passed + this.#failed + this.#errored
  }

  trial(status: string, durationMs: number): void {
    this.#count(status)
    const errors = this.#errored > 0 ? ` / ${this.#errored} errored` : ""
    this.#reporter.step(
      `trial ${this.completed} · ${status} · ${formatDuration(durationMs)}`
      + ` · ${this.#passed} passed / ${this.#failed} failed${errors}`
      + ` · ${formatDuration(Date.now() - this.#startedAt)} of`
      + ` ${formatSeconds(this.#budgetSeconds)}`,
    )
  }

  #count(status: string): void {
    if (status === "failed") {
      this.#failed += 1
    } else if (status === "passed") {
      this.#passed += 1
    } else {
      this.#errored += 1
    }
  }
}
