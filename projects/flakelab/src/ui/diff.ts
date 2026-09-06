import { paint } from "./style.js"
import type { StyleName } from "./style.js"
import { sanitizeText } from "./text.js"
import type { TerminalTheme } from "./theme.js"
import { PLAIN_THEME } from "./theme.js"

const MAXIMUM_RENDERED_LINES = 240

function diffStyle(line: string): StyleName | undefined {
  if (line.startsWith("+++ ") || line.startsWith("--- ")) {
    return "bold"
  }
  if (line.startsWith("@@")) {
    return "cyan"
  }
  if (line.startsWith("+")) {
    return "green"
  }
  if (line.startsWith("-")) {
    return "red"
  }
  if (line.startsWith("Index:") || line.startsWith("=")) {
    return "dim"
  }
  return undefined
}

/** A bounded, sanitized terminal preview; the complete exact patch remains on disk. */
export function formatCandidateDiff(
  diff: string,
  patchPath: string,
  theme: TerminalTheme = PLAIN_THEME,
): string {
  const lines = sanitizeText(diff).split("\n")
  const visible = lines.slice(0, MAXIMUM_RENDERED_LINES)
  const rendered = visible.map((line) => {
    const style = diffStyle(line)
    return style ? paint(theme, style, line) : line
  })
  if (lines.length > MAXIMUM_RENDERED_LINES) {
    rendered.push(paint(
      theme,
      "dim",
      `... preview truncated; complete diff saved to ${patchPath}`,
    ))
  }
  return ["", paint(theme, "bold", "Candidate diff"), ...rendered].join("\n")
}
