import type { StyleName } from "./style.js"
import { paint } from "./style.js"
import type { TerminalTheme } from "./theme.js"

/** The one status vocabulary shared by every FlakeLab command. */
export type StatusTone =
  | "failure"
  | "inconclusive"
  | "muted"
  | "running"
  | "success"
  | "warning"

const UNICODE_SYMBOLS: Record<StatusTone, string> = {
  failure: "✗",
  inconclusive: "?",
  muted: "·",
  running: "›",
  success: "✓",
  warning: "!",
}

const ASCII_SYMBOLS: Record<StatusTone, string> = {
  failure: "x",
  inconclusive: "?",
  muted: "-",
  running: ">",
  success: "+",
  warning: "!",
}

const TONE_STYLES: Record<StatusTone, StyleName> = {
  failure: "red",
  inconclusive: "blue",
  muted: "dim",
  running: "cyan",
  success: "green",
  warning: "yellow",
}

export function toneStyle(tone: StatusTone): StyleName {
  return TONE_STYLES[tone]
}

function statusSymbol(theme: TerminalTheme, tone: StatusTone): string {
  return theme.unicode ? UNICODE_SYMBOLS[tone] : ASCII_SYMBOLS[tone]
}

/** A colored symbol. Callers always print a text label beside it. */
export function statusMark(theme: TerminalTheme, tone: StatusTone): string {
  return paint(theme, toneStyle(tone), statusSymbol(theme, tone))
}
