import { formatDuration } from "./format.js"
import type { StatusTone } from "./status.js"
import { statusMark } from "./status.js"
import { paint } from "./style.js"
import { sanitizeLine, truncate } from "./text.js"
import type { TerminalTheme } from "./theme.js"
import { stderrTheme, terminalActivityEnabled } from "./theme.js"

export type ProgressWriter = (chunk: string) => void

export interface ProgressOptions {
  animate?: boolean
  pulseIntervalMs?: number
  schedulePulse?: PulseScheduler
  theme?: TerminalTheme
  write?: ProgressWriter
}

type CancelPulse = () => void
type PulseScheduler = (pulse: () => void, intervalMs: number) => CancelPulse

const MAXIMUM_DETAIL_LENGTH = 200

function defaultWriter(chunk: string): void {
  process.stderr.write(chunk)
}

function defaultPulseScheduler(pulse: () => void, intervalMs: number): CancelPulse {
  const timer = setInterval(pulse, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

/**
 * Line-oriented stage progress on stderr. Interactive terminals receive a
 * growing dot pulse during quiet work; redirected and CI output stays static.
 * It never emits cursor movement, carriage returns, or erase sequences.
 */
export class ProgressReporter {
  static readonly #active = new Set<ProgressReporter>()
  readonly #animate: boolean
  #cancelPulse: CancelPulse | undefined
  #label: string | undefined
  #pulseDots = 0
  #pulseLineOpen = false
  readonly #pulseIntervalMs: number
  readonly #schedulePulse: PulseScheduler
  #startedAt = 0
  readonly #theme: TerminalTheme
  readonly #write: ProgressWriter

  constructor(options: ProgressOptions = {}) {
    this.#animate = options.animate ?? terminalActivityEnabled()
    this.#pulseIntervalMs = options.pulseIntervalMs ?? 1_000
    this.#schedulePulse = options.schedulePulse ?? defaultPulseScheduler
    this.#theme = options.theme ?? stderrTheme()
    this.#write = options.write ?? defaultWriter
  }

  start(label: string, detail?: string): void {
    this.#stopPulse()
    this.#label = sanitizeLine(label)
    this.#startedAt = Date.now()
    this.#line("running", this.#label, detail)
    ProgressReporter.#active.add(this)
    if (this.#animate) {
      this.#cancelPulse = this.#schedulePulse(() => this.#pulse(), this.#pulseIntervalMs)
    }
  }

  /** A subordinate observation inside the running stage. */
  step(text: string, tone: StatusTone = "muted"): void {
    this.#finishPulseLine()
    this.#write(`  ${statusMark(this.#theme, tone)} ${this.#detail(text)}\n`)
  }

  done(detail?: string): void {
    this.#close("success", detail)
  }

  fail(detail?: string): void {
    this.#close("failure", detail)
  }

  /** Closes any live pulse before the command-level error is rendered. */
  static failActive(): void {
    for (const reporter of [...ProgressReporter.#active]) {
      reporter.fail("failed")
    }
  }

  #close(tone: StatusTone, detail?: string): void {
    const label = this.#label
    if (!label) {
      return
    }
    this.#stopPulse()
    this.#label = undefined
    ProgressReporter.#active.delete(this)
    this.#line(tone, label, detail, formatDuration(Date.now() - this.#startedAt))
  }

  #finishPulseLine(): void {
    if (this.#pulseLineOpen) {
      this.#write("\n")
      this.#pulseLineOpen = false
      this.#pulseDots = 0
    }
  }

  #pulse(): void {
    if (!this.#label) {
      return
    }
    if (!this.#pulseLineOpen) {
      this.#write(`  ${statusMark(this.#theme, "muted")} ${this.#detail("working")}`)
      this.#pulseLineOpen = true
    }
    this.#write(paint(this.#theme, "dim", "."))
    this.#pulseDots += 1
    if (this.#pulseDots >= 12) {
      this.#finishPulseLine()
    }
  }

  #stopPulse(): void {
    this.#cancelPulse?.()
    this.#cancelPulse = undefined
    this.#finishPulseLine()
  }

  #line(tone: StatusTone, label: string, ...details: (string | undefined)[]): void {
    const separator = this.#theme.unicode ? " · " : " | "
    const suffix = details
      .filter((detail): detail is string => detail !== undefined && detail !== "")
      .map((detail) => this.#detail(detail))
    const text = [paint(this.#theme, "bold", label), ...suffix].join(separator)
    this.#write(`${statusMark(this.#theme, tone)} ${text}\n`)
  }

  #detail(value: string): string {
    return paint(this.#theme, "dim", truncate(sanitizeLine(value), MAXIMUM_DETAIL_LENGTH))
  }
}
