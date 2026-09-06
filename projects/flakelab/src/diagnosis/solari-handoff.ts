import { createInterface } from "node:readline/promises"

import { formatSeconds } from "../ui/format.js"
import { sanitizeLine } from "../ui/text.js"
import type { DiscoveryBudget } from "./discovery-budget.js"

type AskQuestion = (question: string, completions?: string[]) => Promise<string>
type DiscoverSources = () => Promise<string[]>

interface SolariHandoffOptions {
  ask?: AskQuestion
  discoverSources?: DiscoverSources
  environment?: NodeJS.ProcessEnv
  inputIsTTY?: boolean
  outputIsTTY?: boolean
}

export interface SolariProofRequest {
  maxSeconds: number
  sources: string[]
}

function interactive(options: SolariHandoffOptions): boolean {
  const environment = options.environment ?? process.env
  return (options.inputIsTTY ?? Boolean(process.stdin.isTTY))
    && (options.outputIsTTY ?? Boolean(process.stderr.isTTY))
    && !environment.CI
}

async function askInTerminal(question: string, completions: string[] = []): Promise<string> {
  const completer = (line: string): [string[], string] => {
    const matches = completions.filter((candidate) => candidate.startsWith(line))
    return [matches.length > 0 ? matches : completions, line]
  }
  const prompt = createInterface({
    completer,
    input: process.stdin,
    output: process.stderr,
  })
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

function acceptedByDefault(answer: string): boolean {
  return answer.trim() === "" || accepted(answer)
}

function candidateQuestion(candidates: string[]): string {
  const choices = candidates
    .map((candidate, index) => `  ${index + 1}. ${sanitizeLine(candidate)}`)
    .join("\n")
  return `Suggested application sources:\n${choices}\n`
    + "Select a number or type a path (Tab shows matches; Enter cancels): "
}

function selectedSource(answer: string, candidates: string[]): string | null {
  const value = answer.trim()
  if (!value) {
    return null
  }
  const selectedIndex = /^\d+$/u.test(value) ? Number(value) - 1 : -1
  return sanitizeLine(candidates[selectedIndex] ?? value)
}

async function requestApprovedSources(
  ask: AskQuestion,
  discoverSources: DiscoverSources | undefined,
): Promise<string[] | null> {
  const candidates = discoverSources ? await discoverSources() : []
  if (candidates.length === 1) {
    const candidate = sanitizeLine(candidates[0])
    if (accepted(await ask(`Approve suggested application source ${candidate}? [y/N] `))) {
      return [candidate]
    }
  }
  const question = candidates.length > 0
    ? candidateQuestion(candidates)
    : "Application source to approve (type a path; Enter cancels): "
  const source = selectedSource(await ask(question, candidates), candidates)
  return source ? [source] : null
}

export async function requestSolariProof(
  approvedSources: string[],
  budget: DiscoveryBudget,
  options: SolariHandoffOptions = {},
): Promise<SolariProofRequest | null> {
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
  let sources = approvedSources
  if (sources.length === 0) {
    const selected = await requestApprovedSources(ask, options.discoverSources)
    if (!selected) {
      return null
    }
    sources = selected
  }
  let maxSeconds = budget.configuredSeconds
  if (budget.recommendedSeconds > budget.configuredSeconds) {
    const question = `Fault discovery is budgeted up to `
      + `${formatSeconds(budget.recommendedSeconds)}, above the current `
      + `${formatSeconds(budget.configuredSeconds)} limit. Raise the limit? [Y/n] `
    if (acceptedByDefault(await ask(question))) {
      maxSeconds = budget.recommendedSeconds
    }
  }
  return { maxSeconds, sources }
}
