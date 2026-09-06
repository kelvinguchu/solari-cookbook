import { expect, test } from "@playwright/test"

import {
  credentialStatus,
  requireCredential,
} from "../../src/security/credentials.js"
import type { CredentialProvider } from "../../src/security/credentials.js"

test("credential status reports configuration without exposing the value", () => {
  const status = credentialStatus("groq", {
    environment: { GROQ_API_KEY: "configured-value" },
    loadEnvironmentFile: false,
  })

  expect(status).toEqual({
    configured: true,
    environmentName: "GROQ_API_KEY",
    source: "environment",
  })
  expect(JSON.stringify(status)).not.toContain("configured-value")
})

test("run-once credentials are prompted once and retained only in memory", async () => {
  const cache = new Map<CredentialProvider, string>()
  const environment: NodeJS.ProcessEnv = {}
  let prompts = 0
  const prompt = (): Promise<string> => {
    prompts += 1
    return Promise.resolve("run-once-value")
  }

  const first = await requireCredential("solari", {
    cache,
    environment,
    loadEnvironmentFile: false,
    prompt,
  })
  const second = await requireCredential("solari", {
    cache,
    environment,
    loadEnvironmentFile: false,
    prompt,
  })

  expect(first).toBe("run-once-value")
  expect(second).toBe("run-once-value")
  expect(prompts).toBe(1)
  expect(environment.SOLARI_API_KEY).toBeUndefined()
})

test("an empty interactive credential is rejected", async () => {
  await expect(requireCredential("groq", {
    cache: new Map(),
    environment: {},
    loadEnvironmentFile: false,
    prompt: () => Promise.resolve("   "),
  })).rejects.toThrow("GROQ_API_KEY was not provided")
})

test("forced prompting replaces a configured key for the current run", async () => {
  const cache = new Map<CredentialProvider, string>()
  let prompts = 0
  const first = await requireCredential("groq", {
    cache,
    environment: { GROQ_API_KEY: "stale-environment-value" },
    forcePrompt: true,
    loadEnvironmentFile: false,
    prompt: () => {
      prompts += 1
      return Promise.resolve("replacement-value")
    },
  })
  const second = await requireCredential("groq", {
    cache,
    environment: { GROQ_API_KEY: "stale-environment-value" },
    forcePrompt: true,
    loadEnvironmentFile: false,
    prompt: () => Promise.resolve("must-not-be-used"),
  })

  expect(first).toBe("replacement-value")
  expect(second).toBe("replacement-value")
  expect(prompts).toBe(1)
})
