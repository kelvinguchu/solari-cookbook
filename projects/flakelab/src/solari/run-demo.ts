import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { createNdjsonWriter } from "../artifacts/ndjson.js"
import { runRequestSchema } from "../domain/schema.js"
import type { DiagnosticResult } from "../runner/local.js"
import { runLocalDiagnostics } from "../runner/local.js"
import {
  CHECKOUT_APP_DIRECTORY,
  CHECKOUT_PORT,
  checkoutServerSource,
} from "./checkout-fixture.js"
import {
  CHECKOUT_START_COMMAND,
  CHECKOUT_START_SHELL,
  SOLARI_SANDBOX_TEMPLATE,
  SOLARI_SANDBOX_TIMEOUT_MS,
  SolariParallelExecutor,
} from "./executor.js"
import type { ResourceUsage } from "./usage.js"

export interface SolariDemoOptions {
  apiKey: string
  artifactDirectory: string
  baseUrl: string
  concurrency: number
  delayMs: number
  projectRoot: string
  runs: number
  seed: number
  signal?: AbortSignal
}

const execFileAsync = promisify(execFile)

export interface SnapshotPreparationInput {
  appDirectory: string
  commit: string
  fixture: string
  lockfile: string
  port: number
  runtime: string
  startShell: string
  startCommand: string
  template: string
  timeoutMs: number
}

export function snapshotCacheKey(input: SnapshotPreparationInput): string {
  const stableInput: SnapshotPreparationInput = {
    appDirectory: input.appDirectory,
    commit: input.commit,
    fixture: input.fixture,
    lockfile: input.lockfile,
    port: input.port,
    runtime: input.runtime,
    startShell: input.startShell,
    startCommand: input.startCommand,
    template: input.template,
    timeoutMs: input.timeoutMs,
  }
  return createHash("sha256")
    .update(JSON.stringify(stableInput))
    .digest("hex")
    .slice(0, 24)
}

async function snapshotKey(projectRoot: string): Promise<string> {
  const [{ stdout: commit }, lockfile] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }),
    readFile(resolve(projectRoot, "pnpm-lock.yaml"), "utf8"),
  ])
  return snapshotCacheKey({
    appDirectory: CHECKOUT_APP_DIRECTORY,
    commit: commit.trim(),
    fixture: checkoutServerSource,
    lockfile,
    port: CHECKOUT_PORT,
    runtime: "python3",
    startCommand: CHECKOUT_START_COMMAND,
    startShell: CHECKOUT_START_SHELL,
    template: SOLARI_SANDBOX_TEMPLATE,
    timeoutMs: SOLARI_SANDBOX_TIMEOUT_MS,
  })
}

export interface SolariDemoResult extends DiagnosticResult {
  artifactPath: string
  metricsPath: string
  snapshotId: string
  usage: ResourceUsage
}

export async function runSolariDemo(options: SolariDemoOptions): Promise<SolariDemoResult> {
  const runDirectory = resolve(options.artifactDirectory, `solari-${Date.now()}`)
  const artifactPath = resolve(runDirectory, "events.ndjson")
  const metricsPath = resolve(runDirectory, "metrics.json")
  const request = runRequestSchema.parse({
    selector: "solari-checkout-demo",
    runs: options.runs,
    seed: options.seed,
    artifactDirectory: runDirectory,
    faults: [{
      kind: "network-delay",
      pattern: "**/api/checkout",
      delayMs: options.delayMs,
    }],
  })
  const executor = new SolariParallelExecutor({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    signal: options.signal,
    snapshotKey: await snapshotKey(options.projectRoot),
  })
  let result: DiagnosticResult
  let snapshotId: string
  try {
    await executor.prepare()
    snapshotId = executor.snapshotId()
    result = await runLocalDiagnostics(
      request,
      executor.execute,
      createNdjsonWriter(artifactPath),
      { concurrency: options.concurrency, signal: options.signal },
    )
  } finally {
    await executor.close()
  }
  const usage = executor.usage()
  await writeFile(metricsPath, `${JSON.stringify(usage, null, 2)}\n`, { encoding: "utf8" })
  return { ...result, artifactPath, metricsPath, snapshotId, usage }
}
