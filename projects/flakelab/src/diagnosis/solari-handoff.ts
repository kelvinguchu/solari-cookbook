import { createInterface } from "node:readline/promises"

import { sanitizeLine } from "../ui/text.js"

type AskQuestion = (question: string) => Promise<string>

interface SolariHandoffOptions {
  ask?: AskQuestion
  environment?: NodeJS.ProcessEnv
  inputIsTTY?: boolean
  outputIsTTY?: boolean
}

function interactive(options: SolariHandoffOptions): boolean {
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

function accepted(answer: string): boolean {
  const normalized = answer.trim().toLowerCase()
  return normalized === "y" || normalized === "yes"
}

export async function requestSolariProof(
  target: string,
  approvedSources: string[],
  options: SolariHandoffOptions = {},
): Promise<string[] | null> {
  if (!interactive(options)) {
    return null
  }
  const ask = options.ask ?? askInTerminal
  if (!accepted(await ask("Use Solari to prove a candidate fix? [y/N] "))) {
    return null
  }
  if (!accepted(await ask("Use AI to investigate and generate the candidate? [y/N] "))) {
    return null
  }
  if (approvedSources.length > 0) {
    return approvedSources
  }
  const safeTarget = sanitizeLine(target)
  const source = (await ask(
    `Source file to approve for candidate changes [${safeTarget}]: `,
  )).trim()
  return [source || target]
}
