const SECOND = 1_000
const MINUTE = 60 * SECOND

/** Compact, comparable durations. Milliseconds below a second, then seconds. */
export function formatDuration(milliseconds: number): string {
  const value = Math.max(0, Math.round(milliseconds))
  if (value < SECOND) {
    return `${value} ms`
  }
  if (value < MINUTE) {
    return `${(value / SECOND).toFixed(1)}s`
  }
  const minutes = Math.floor(value / MINUTE)
  const seconds = Math.round((value % MINUTE) / SECOND)
  return `${minutes}m ${seconds}s`
}

export function formatSeconds(seconds: number): string {
  return formatDuration(seconds * SECOND)
}

export function formatUsd(value: number, fractionDigits = 2): string {
  return `$${value.toFixed(fractionDigits)}`
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`
}

/** Quotes a value for a copyable shell command without inviting injection. */
export function shellArgument(value: string): string {
  return /^[\w./@:=-]+$/u.test(value) ? value : JSON.stringify(value)
}
