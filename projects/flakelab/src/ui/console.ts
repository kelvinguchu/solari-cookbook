/** Human summaries keep the stream they already used; only the presentation changes. */
export function writeStdout(text: string): void {
  process.stdout.write(`${text}
`)
}

/** Progress, provider notices, and errors are diagnostics: they belong on stderr. */
export function writeStderr(text: string): void {
  process.stderr.write(`${text}
`)
}
