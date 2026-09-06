export interface TerminalTheme {
  readonly color: boolean
  readonly unicode: boolean
  readonly width: number
}

export interface TerminalContext {
  columns?: number
  env: NodeJS.ProcessEnv
  isTTY: boolean
  platform: NodeJS.Platform
}

const DEFAULT_WIDTH = 80
const MINIMUM_WIDTH = 40
const MAXIMUM_WIDTH = 100

/** Plain, deterministic rendering: the contract for redirected output and tests. */
export const PLAIN_THEME: TerminalTheme = {
  color: false,
  unicode: true,
  width: DEFAULT_WIDTH,
}

function enabledFlag(value: string): boolean {
  return value !== "" && value !== "0" && value !== "false"
}

function present(value: string | undefined): value is string {
  return value !== undefined && value !== ""
}

/**
 * Honors NO_COLOR (any non-empty value disables), then FORCE_COLOR, then a dumb
 * terminal, then CI, and finally whether the stream is an interactive terminal.
 */
export function colorEnabled(context: TerminalContext): boolean {
  const { env } = context
  if (present(env.NO_COLOR)) {
    return false
  }
  if (env.FORCE_COLOR !== undefined) {
    return enabledFlag(env.FORCE_COLOR)
  }
  if (env.TERM === "dumb") {
    return false
  }
  if (present(env.CI)) {
    return false
  }
  return context.isTTY
}

function unicodeEnabled(context: TerminalContext): boolean {
  if (context.platform !== "win32") {
    return true
  }
  const { env } = context
  return env.WT_SESSION !== undefined
    || env.TERM_PROGRAM === "vscode"
    || env.ConEmuANSI === "ON"
    || env.TERM !== undefined
}

export function terminalWidth(context: TerminalContext): number {
  const columns = context.columns
  if (columns === undefined || !Number.isFinite(columns) || columns <= 0) {
    return DEFAULT_WIDTH
  }
  return Math.min(Math.max(Math.trunc(columns), MINIMUM_WIDTH), MAXIMUM_WIDTH)
}

export function createTheme(context: TerminalContext): TerminalTheme {
  return {
    color: colorEnabled(context),
    unicode: unicodeEnabled(context),
    width: terminalWidth(context),
  }
}

function streamContext(
  stream: NodeJS.WriteStream,
  env: NodeJS.ProcessEnv = process.env,
): TerminalContext {
  return {
    ...(stream.columns ? { columns: stream.columns } : {}),
    env,
    isTTY: Boolean(stream.isTTY),
    platform: process.platform,
  }
}

export function streamTheme(
  stream: NodeJS.WriteStream,
  env: NodeJS.ProcessEnv = process.env,
): TerminalTheme {
  return createTheme(streamContext(stream, env))
}

export function stdoutTheme(): TerminalTheme {
  return streamTheme(process.stdout)
}

export function stderrTheme(): TerminalTheme {
  return streamTheme(process.stderr)
}

/** Live terminal affordances stay out of redirected output and CI logs. */
export function terminalActivityEnabled(
  stream: NodeJS.WriteStream = process.stderr,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(stream.isTTY) && !present(env.CI) && env.TERM !== "dumb"
}
