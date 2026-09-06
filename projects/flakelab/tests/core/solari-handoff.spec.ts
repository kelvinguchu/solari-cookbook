import { expect, test } from "@playwright/test"

import { requestSolariProof } from "../../src/diagnosis/solari-handoff.js"
import { preflightProofCredentials } from "../../src/proof/preflight.js"

const interactive = { environment: {}, inputIsTTY: true, outputIsTTY: true }

test("Solari proof handoff is skipped outside an interactive terminal", async () => {
  let questions = 0
  const ask = (): Promise<string> => {
    questions += 1
    return Promise.resolve("yes")
  }

  await expect(requestSolariProof("tests/checkout.spec.ts", [], {
    ask,
    inputIsTTY: false,
    outputIsTTY: true,
  })).resolves.toBeNull()
  await expect(requestSolariProof("tests/checkout.spec.ts", [], {
    ask,
    environment: { CI: "true" },
    inputIsTTY: true,
    outputIsTTY: true,
  })).resolves.toBeNull()
  expect(questions).toBe(0)
})

test("Solari proof handoff defaults to no", async () => {
  await expect(requestSolariProof(
    "tests/checkout.spec.ts",
    [],
    { ...interactive, ask: () => Promise.resolve("") },
  )).resolves.toBeNull()
})

test("AI candidate generation requires separate consent", async () => {
  const questions: string[] = []
  const answers = ["yes", ""]

  await expect(requestSolariProof("tests/checkout.spec.ts", [], {
    ...interactive,
    ask: (question) => {
      questions.push(question)
      return Promise.resolve(answers.shift() ?? "")
    },
  })).resolves.toBeNull()
  expect(questions).toEqual([
    "Use Solari to prove a candidate fix? [y/N] ",
    "Use AI to investigate and generate the candidate? [y/N] ",
  ])
})

test("Solari proof handoff preserves explicitly approved sources", async () => {
  const questions: string[] = []
  const sources = ["src/checkout.ts"]

  await expect(requestSolariProof("tests/checkout.spec.ts", sources, {
    ...interactive,
    ask: (question) => {
      questions.push(question)
      return Promise.resolve("yes")
    },
  })).resolves.toEqual(sources)
  expect(questions).toEqual([
    "Use Solari to prove a candidate fix? [y/N] ",
    "Use AI to investigate and generate the candidate? [y/N] ",
  ])
})

test("Solari proof handoff asks for a source and defaults to the test target", async () => {
  const answers = ["y", "y", ""]

  await expect(requestSolariProof("tests/checkout.spec.ts", [], {
    ...interactive,
    ask: () => Promise.resolve(answers.shift() ?? ""),
  })).resolves.toEqual(["tests/checkout.spec.ts"])
})

test("proof credentials are checked up front in provider order", async () => {
  const requested: string[] = []

  await preflightProofCredentials(true, (provider, forcePrompt) => {
    requested.push(`${provider}:${String(forcePrompt)}`)
    return Promise.resolve("configured")
  })

  expect(requested).toEqual(["groq:true", "solari:true"])
})
