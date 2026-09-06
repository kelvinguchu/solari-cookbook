import type { StatusTone } from "./status.js"
import { statusMark, toneStyle } from "./status.js"
import { paint } from "./style.js"
import { displayWidth, padRight, sanitizeLine, sanitizeText, truncate, wrapText } from "./text.js"
import type { TerminalTheme } from "./theme.js"
import { PLAIN_THEME } from "./theme.js"

export interface DocumentRow {
  label: string
  tone?: StatusTone
  value: string
}

const INDENT = "  "
const MARK_INDENT = "     "
const MAXIMUM_LABEL_WIDTH = 22
const MAXIMUM_DETAIL_LENGTH = 600

export function labelColumn(rows: DocumentRow[]): number {
  const widest = rows.reduce((width, row) => Math.max(width, displayWidth(row.label)), 0)
  return Math.min(widest, MAXIMUM_LABEL_WIDTH)
}

/**
 * Builds one command's terminal output from a small, shared set of primitives:
 * a heading, semantic status lines, aligned key/value rows, grouped sections,
 * evidence paths, and copyable commands. Every value that can originate outside
 * FlakeLab is sanitized before it reaches the terminal.
 */
export class TerminalDocument {
  readonly #lines: string[] = []
  readonly #theme: TerminalTheme

  constructor(theme: TerminalTheme = PLAIN_THEME) {
    this.#theme = theme
  }

  blank(): this {
    if (this.#lines.length > 0 && this.#lines[this.#lines.length - 1] !== "") {
      this.#lines.push("")
    }
    return this
  }

  /** One bold line and a single thin rule. Nothing else. */
  banner(text: string): this {
    const safe = sanitizeLine(text)
    this.#lines.push(paint(this.#theme, "bold", safe))
    const rule = (this.#theme.unicode ? "─" : "-").repeat(
      Math.min(displayWidth(safe), this.#theme.width),
    )
    this.#lines.push(paint(this.#theme, "dim", rule))
    return this
  }

  /**
   * The product name and the command that produced this output. A leading blank
   * line separates it from stage progress and from a previous command summary.
   */
  heading(title: string): this {
    this.#lines.push("")
    return this.banner(`FlakeLab ${this.#theme.unicode ? "·" : "-"} ${title}`)
  }

  section(title: string): this {
    this.blank()
    this.#lines.push(paint(this.#theme, "bold", sanitizeLine(title)))
    return this
  }

  /** The single most important line of a command: its result. */
  verdict(tone: StatusTone, label: string, detail?: string): this {
    this.blank()
    this.#lines.push(
      `${INDENT}${statusMark(this.#theme, tone)}  ${paint(this.#theme, "bold", sanitizeLine(label))}`,
    )
    return detail === undefined ? this : this.detail(detail)
  }

  /** One item in a list of observations, checks, or trials. */
  entry(tone: StatusTone, label: string, detail?: string): this {
    this.#lines.push(`${INDENT}${statusMark(this.#theme, tone)}  ${sanitizeLine(label)}`)
    return detail === undefined ? this : this.detail(detail)
  }

  /** Secondary prose beneath a verdict or entry, wrapped to the terminal width. */
  detail(text: string, tone: StatusTone = "muted"): this {
    const safe = truncate(sanitizeText(text), MAXIMUM_DETAIL_LENGTH)
    const width = Math.max(this.#theme.width - MARK_INDENT.length, 24)
    for (const line of wrapText(safe, width)) {
      const rendered = tone === "muted" ? paint(this.#theme, "dim", line) : line
      this.#lines.push(`${MARK_INDENT}${rendered}`)
    }
    return this
  }

  rows(rows: DocumentRow[], labelWidth?: number): this {
    const column = labelWidth ?? labelColumn(rows)
    for (const row of rows) {
      this.#appendRow(row, column)
    }
    return this
  }

  /** Quiet supporting prose aligned with rows and commands. */
  note(value: string): this {
    const width = Math.max(this.#theme.width - INDENT.length, 24)
    for (const line of wrapText(sanitizeText(value), width)) {
      this.#lines.push(`${INDENT}${paint(this.#theme, "dim", line)}`)
    }
    return this
  }

  /** A copyable command. Never prefixed with a shell sigil. */
  command(value: string): this {
    this.#lines.push(`${INDENT}${paint(this.#theme, "cyan", sanitizeLine(value))}`)
    return this
  }

  text(value: string): this {
    for (const line of wrapText(sanitizeText(value), this.#theme.width - INDENT.length)) {
      this.#lines.push(line === "" ? "" : `${INDENT}${line}`)
    }
    return this
  }

  render(): string {
    return this.#lines.join("\n")
  }

  #appendRow(row: DocumentRow, column: number): void {
    const label = paint(this.#theme, "dim", padRight(sanitizeLine(row.label), column))
    const available = this.#theme.width - INDENT.length - column - 2
    const wrapped = wrapText(sanitizeLine(row.value), available)
      .map((line) => this.#paintValue(line, row.tone))
    this.#lines.push(`${INDENT}${label}  ${wrapped[0] ?? ""}`)
    const continuation = " ".repeat(INDENT.length + column + 2)
    for (const line of wrapped.slice(1)) {
      this.#lines.push(`${continuation}${line}`)
    }
  }

  #paintValue(line: string, tone: StatusTone | undefined): string {
    if (tone === undefined) {
      return line
    }
    return paint(this.#theme, tone === "muted" ? "dim" : toneStyle(tone), line)
  }
}
