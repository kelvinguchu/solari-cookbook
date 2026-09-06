import { parseCliArguments, type CliInvocation } from "./cli-arguments.js"
import { helpText, VERSION } from "./cli-help.js"
import { writeStderr, writeStdout } from "./ui/console.js"
import { TerminalDocument } from "./ui/document.js"
import { stderrTheme, stdoutTheme } from "./ui/theme.js"

type ExecutableInvocation = Exclude<CliInvocation, { command: "help" | "version" }>
type NonScanInvocation = Exclude<
  ExecutableInvocation,
  { command: "analyze" | "resume" | "scan" }
>

const PROVIDER_COMMANDS = new Set<ExecutableInvocation["command"]>([
  "bisect",
  "investigate",
  "prove",
  "repair",
  "report",
])

async function runNonScanCommand(invocation: NonScanInvocation): Promise<void> {
  switch (invocation.command) {
    case "bisect": {
      const { bisect } = await import("./commands/bisect.js")
      await bisect(invocation.options)
      return
    }
    case "diagnose": {
      const { diagnose } = await import("./commands/diagnose.js")
      await diagnose(invocation.target, invocation.options)
      return
    }
    case "discover": {
      const { discover } = await import("./commands/discover.js")
      await discover(invocation.target, invocation.options)
      return
    }
    case "doctor": {
      const { doctor } = await import("./commands/doctor.js")
      await doctor()
      return
    }
    case "investigate": {
      const { investigate } = await import("./commands/investigate.js")
      await investigate(invocation.target, invocation.options)
      return
    }
    case "prove": {
      const { prove } = await import("./commands/prove.js")
      await prove(invocation.target, invocation.options)
      return
    }
    case "repair": {
      const { repair } = await import("./commands/repair.js")
      await repair(invocation.target, invocation.options)
      return
    }
    case "replay": {
      const { replay } = await import("./commands/replay.js")
      await replay(invocation.target, invocation.options)
      return
    }
    case "report": {
      const { generateReport } = await import("./commands/report.js")
      await generateReport(invocation.target, invocation.options)
      return
    }
  }
}

async function runCommand(invocation: ExecutableInvocation): Promise<void> {
  if (invocation.command === "analyze") {
    const { analyze } = await import("./commands/analyze.js")
    await analyze(invocation.target, invocation.options)
    return
  }
  if (invocation.command === "scan") {
    const { scan } = await import("./commands/scan.js")
    await scan(invocation.target, invocation.options)
    return
  }
  if (invocation.command === "resume") {
    const { resumeDiagnosis } = await import("./commands/diagnose.js")
    await resumeDiagnosis(invocation.target)
    return
  }
  await runNonScanCommand(invocation)
}

async function providerErrorMessage(error: Error): Promise<string> {
  try {
    const { cliErrorMessage } = await import("./providers/errors.js")
    return cliErrorMessage(error)
  } catch {
    return error.message
  }
}

/**
 * Command failures use the same status vocabulary as successful output, on
 * stderr, so a machine-readable stdout stream stays clean.
 */
function failureText(message: string): string {
  return new TerminalDocument(stderrTheme()).entry("failure", message).render()
}

async function main(): Promise<void> {
  let providerCommand = false
  try {
    const invocation = parseCliArguments(process.argv.slice(2))
    if (invocation.command === "help") {
      process.stdout.write(helpText(invocation.topic, stdoutTheme()))
      return
    }
    if (invocation.command === "version") {
      writeStdout(VERSION)
      return
    }
    providerCommand = PROVIDER_COMMANDS.has(invocation.command)
    await runCommand(invocation)
  } catch (error) {
    let message = "FlakeLab failed"
    if (error instanceof Error) {
      message = providerCommand ? await providerErrorMessage(error) : error.message
    }
    writeStderr(failureText(message))
    process.exitCode = 1
  }
}

await main()
