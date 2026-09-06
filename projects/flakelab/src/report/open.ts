import { spawn } from "node:child_process"
import { createInterface } from "node:readline/promises"

type AskQuestion = (question: string) => Promise<string>

interface ConfirmOpenOptions {
  ask?: AskQuestion
  environment?: NodeJS.ProcessEnv
  inputIsTTY?: boolean
  outputIsTTY?: boolean
}

function opener(): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return { command: "explorer.exe", args: [] }
  }
  if (process.platform === "darwin") {
    return { command: "open", args: [] }
  }
  return { command: "xdg-open", args: [] }
}

export function openLocalReport(path: string): void {
  const selected = opener()
  const child = spawn(selected.command, [...selected.args, path], {
    detached: true,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  })
  child.once("error", () => {
    process.stderr.write("Could not open the report automatically; open the generated HTML file directly.\n")
  })
  child.unref()
}

function interactive(options: ConfirmOpenOptions): boolean {
  const environment = options.environment ?? process.env
  return (options.inputIsTTY ?? Boolean(process.stdin.isTTY))
    && (options.outputIsTTY ?? Boolean(process.stderr.isTTY))
    && !environment.CI
}

async function askInTerminal(question: string): Promise<string> {
  const prompt = createInterface({ input: process.stdin, output: process.stderr })
  try {
    return await prompt.question(question)
  } finally {
    prompt.close()
  }
}

export async function confirmLocalReportOpen(
  options: ConfirmOpenOptions = {},
): Promise<boolean> {
  if (!interactive(options)) {
    return false
  }
  const answer = (await (options.ask ?? askInTerminal)(
    "Open the generated report in your browser? [Y/n] ",
  )).trim().toLowerCase()
  return answer === "" || answer === "y" || answer === "yes"
}
