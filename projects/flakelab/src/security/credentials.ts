import { config } from "dotenv"
import { createInterface } from "node:readline/promises"
import { Writable } from "node:stream"

export type CredentialProvider = "groq" | "solari"
export type CredentialSource = "environment" | "environment-file" | "run-once-prompt"

interface CredentialDefinition {
  environmentName: "GROQ_API_KEY" | "SOLARI_API_KEY"
  label: string
  purpose: string
}

export interface CredentialStatus {
  configured: boolean
  environmentName: CredentialDefinition["environmentName"]
  source?: CredentialSource
}

type SecretPrompt = (message: string) => Promise<string>

interface CredentialOptions {
  cache?: Map<CredentialProvider, string>
  environment?: NodeJS.ProcessEnv
  forcePrompt?: boolean
  loadEnvironmentFile?: boolean
  prompt?: SecretPrompt
}

const CREDENTIALS: Record<CredentialProvider, CredentialDefinition> = {
  groq: {
    environmentName: "GROQ_API_KEY",
    label: "Groq",
    purpose: "AI investigation and candidate generation",
  },
  solari: {
    environmentName: "SOLARI_API_KEY",
    label: "Solari",
    purpose: "isolated proof and report publication",
  },
}

const runCredentials = new Map<CredentialProvider, string>()

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim()
  if (result) {
    return result
  }
  return undefined
}

function loadCredential(
  definition: CredentialDefinition,
  options: CredentialOptions,
): { source?: CredentialSource; value?: string } {
  const environment = options.environment ?? process.env
  const existing = trimmed(environment[definition.environmentName])
  if (existing) {
    return { source: "environment", value: existing }
  }
  if (options.loadEnvironmentFile !== false) {
    const fileEnvironment: NodeJS.ProcessEnv = {}
    config({ processEnv: fileEnvironment, quiet: true })
    const fromFile = trimmed(fileEnvironment[definition.environmentName])
    if (fromFile) {
      return { source: "environment-file", value: fromFile }
    }
  }
  return {}
}

function canPrompt(): boolean {
  return process.stdin.isTTY && process.stderr.isTTY
}

async function hiddenPrompt(message: string): Promise<string> {
  const mutedOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
  const terminal = createInterface({
    input: process.stdin,
    output: mutedOutput,
    terminal: true,
  })
  process.stderr.write(message)
  try {
    return (await terminal.question("")).trim()
  } finally {
    terminal.close()
    process.stderr.write("\n")
  }
}

export function credentialStatus(
  provider: CredentialProvider,
  options: CredentialOptions = {},
): CredentialStatus {
  const definition = CREDENTIALS[provider]
  const cache = options.cache ?? runCredentials
  if (cache.has(provider)) {
    return {
      configured: true,
      environmentName: definition.environmentName,
      source: "run-once-prompt",
    }
  }
  const credential = loadCredential(definition, options)
  return {
    configured: Boolean(credential.value),
    environmentName: definition.environmentName,
    ...(credential.source ? { source: credential.source } : {}),
  }
}

export async function requireCredential(
  provider: CredentialProvider,
  options: CredentialOptions = {},
): Promise<string> {
  const definition = CREDENTIALS[provider]
  const cache = options.cache ?? runCredentials
  const cached = cache.get(provider)
  if (cached) {
    return cached
  }
  if (!options.forcePrompt) {
    const credential = loadCredential(definition, options)
    if (credential.value) {
      return credential.value
    }
  }
  const prompt = options.prompt ?? (canPrompt() ? hiddenPrompt : undefined)
  if (!prompt) {
    throw new Error(
      `${definition.environmentName} is required for ${definition.purpose}; configure it as an environment secret or run FlakeLab in an interactive terminal`,
    )
  }
  process.stderr.write(`FlakeLab needs ${definition.label} for ${definition.purpose}.\n`)
  const value = trimmed(await prompt(
    `${definition.environmentName} (hidden · used for this run only): `,
  ))
  if (!value) {
    throw new Error(`${definition.environmentName} was not provided`)
  }
  cache.set(provider, value)
  return value
}
