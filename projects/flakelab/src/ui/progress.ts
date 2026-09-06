import { formatDuration } from "./format.js"
import type { StatusTone } from "./status.js"
import { statusMark } from "./status.js"
import { paint } from "./style.js"
import { sanitizeLine, truncate } from "./text.js"
import type { TerminalTheme } from "./theme.js"
import { stderrTheme } from "./theme.js"

export type ProgressWriter = (chunk: string) => void

export interface ProgressOptions {
  theme?: TerminalTheme
  write?: ProgressWriter
}

const MAXIMUM_DETAIL_LENGTH = 200

function defaultWriter(chunk: string): void {
  process.stderr.write(chunk)
}

/**
 * Line-oriented stage progress on stderr. It never emits cursor movement,
 * carriage returns, or erase sequences, so a redirected or CI log is identical
 * to what an interactive terminal shows apart from color.
 */
export class ProgressReporter {
  #label: string | undefined
  #startedAt = 0
  readonly #theme: TerminalTheme
  readonly #write: ProgressWriter

  constructor(options: ProgressOptions = {}) {
    this.#theme = options.theme ?? stderrTheme()
    this.#write = options.write ?? defaultWriter
  }

  start(label: string, detail?: string): void {
    this.#label = sanitizeLine(label)
    this.#startedAt = Date.now()
    this.#line("running", this.#label, detail)
  }

  /** A subordinate observation inside the running stage. */
  step(text: string, tone: StatusTone = "muted"): void {
    this.#write(`  ${statusMark(this.#theme, tone)} ${this.#detail(text)}\n`)
  }

  done(detail?: string): void {
    this.#close("success", detail)
  }

  fail(detail?: string): void {
    this.#close("failure", detail)
  }

  #close(tone: StatusTone, detail?: string): void {
    const label = this.#label
    if (!label) {
      return
    }
    this.#label = undefined
    this.#line(tone, label, detail, formatDuration(Date.now() - this.#startedAt))
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
