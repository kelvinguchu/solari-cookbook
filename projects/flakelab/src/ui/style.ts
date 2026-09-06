import type { TerminalTheme } from "./theme.js"

export type StyleName = "blue" | "bold" | "cyan" | "dim" | "green" | "red" | "yellow"

const CODES: Record<StyleName, readonly [number, number]> = {
  blue: [34, 39],
  bold: [1, 22],
  cyan: [36, 39],
  dim: [2, 22],
  green: [32, 39],
  red: [31, 39],
  yellow: [33, 39],
}

/**
 * Applies one SGR style. Only the four-bit palette is used so the output stays
 * legible in Windows consoles and in terminals with custom themes. Cursor and
 * erase sequences are deliberately absent: redirected output stays plain text.
 */
export function paint(theme: TerminalTheme, name: StyleName, value: string): string {
  if (!theme.color || value === "") {
    return value
  }
  const [open, close] = CODES[name]
  return `\u001B[${open}m${value}\u001B[${close}m`
}
