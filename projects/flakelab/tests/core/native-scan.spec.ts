import { expect, test } from "@playwright/test"
import { spawnSync } from "node:child_process"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import {
  nativeScanArguments,
  parseNativeScanReport,
  runNativePlaywrightScan,
} from "../../src/runner/native-scan.js"

const PROJECT_ROOT = resolve("test-project-root")
const TASKKILL_PATH = resolve(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe")

type ResultStatus = "failed" | "interrupted" | "passed" | "skipped" | "timedOut"

interface ReportEntry {
  attachments?: Array<{ contentType: string; name: string; path: string }>
  error?: string
  file?: string
  line: number
  result: ResultStatus
  title: string
}

function testStatus(result: ResultStatus): "expected" | "skipped" | "unexpected" {
  if (result === "skipped") {
    return "skipped"
  }
  return result === "passed" ? "expected" : "unexpected"
}

function report(entries: ReportEntry[]): string {
  return JSON.stringify({
    errors: [],
    suites: [{
      title: "fixtures\\mixed.spec.ts",
      specs: entries.map((entry, index) => ({
        column: 1,
        file: entry.file ?? "fixtures/mixed.spec.ts",
        id: `unstable-reporter-id-${index}`,
        line: entry.line,
        tests: [{
          projectName: "chromium",
          results: [{
            attachments: entry.attachments ?? (entry.result === "failed"
              ? [{ contentType: "application/zip", name: "trace", path: "artifacts/trace.zip" }]
              : []),
            duration: 10,
            errors: entry.result === "failed"
              ? [{ message: entry.error ?? "Error: Authorization: Bearer credential-value" }]
              : [],
            status: entry.result,
          }],
          status: testStatus(entry.result),
        }],
        title: entry.title,
      })),
    }],
  })
}

test("native report parser groups repetitions by persistent identity instead of reporter id", () => {
  const parsed = parseNativeScanReport(report([
    { line: 12, result: "passed", title: "checkout completes" },
    { line: 12, result: "failed", title: "checkout completes" },
  ]), PROJECT_ROOT)

  expect(parsed.tests).toHaveLength(1)
  expect(parsed.tests[0]).toMatchObject({
    counts: { errors: 0, failed: 1, passed: 1, skipped: 0 },
    failureRate: 0.5,
    status: "mixed-outcomes",
    trials: 2,
  })
  expect(parsed.tests[0].identity).toMatchObject({
    file: "fixtures/mixed.spec.ts",
    line: 12,
    project: "chromium",
    titlePath: ["checkout completes"],
  })
  expect(parsed.tests[0]).toMatchObject({ multipleFailureModes: false, omittedFailureModes: 0 })
  expect(parsed.tests[0].failureClusters).toHaveLength(1)
  expect(parsed.tests[0].failureClusters[0]).toMatchObject({
    firstObservedAttempt: 2,
    lastObservedAttempt: 2,
    observedRate: 0.5,
    occurrences: 1,
    representativeArtifacts: [{
      contentType: "application/zip",
      name: "trace",
      path: "artifacts/trace.zip",
    }],
  })
  expect(parsed.tests[0].failureClusters[0].representativeReason).not.toContain("credential-value")
  expect(parsed.tests[0].failureClusters[0].representativeReason).toContain("[REDACTED]")
  expect(parsed.tests[0].failureClusters[0].signature).toMatch(/^[a-f0-9]{16}$/u)
})

test("native report parser clusters normalized failures and representative evidence", () => {
  const parsed = parseNativeScanReport(report([
    {
      attachments: [
        { contentType: "application/zip", name: "trace", path: "artifacts/first-trace.zip" },
        { contentType: "text/plain", name: "log", path: "artifacts/debug.log" },
      ],
      error: "Error: checkout timed out after 1.2s at checkout.ts:12:4",
      line: 12,
      result: "failed",
      title: "checkout completes",
    },
    {
      attachments: [{ contentType: "image/png", name: "screenshot", path: "artifacts/failure.png" }],
      error: "Error: checkout timed out after 842ms at checkout.ts:99:8",
      line: 12,
      result: "failed",
      title: "checkout completes",
    },
    {
      attachments: [{ contentType: "video/webm", name: "video", path: "artifacts/failure.webm" }],
      error: "Error: checkout returned HTTP 500",
      line: 12,
      result: "failed",
      title: "checkout completes",
    },
  ]), PROJECT_ROOT)

  const testResult = parsed.tests[0]
  expect(testResult.multipleFailureModes).toBe(true)
  expect(testResult.omittedFailureModes).toBe(0)
  expect(testResult.failureClusters).toHaveLength(2)
  expect(testResult.failureClusters[0]).toMatchObject({
    firstObservedAttempt: 1,
    lastObservedAttempt: 2,
    occurrences: 2,
    representativeArtifacts: [
      { name: "trace", path: "artifacts/first-trace.zip" },
      { name: "screenshot", path: "artifacts/failure.png" },
    ],
  })
  expect(testResult.failureClusters[0].observedRate).toBeCloseTo(2 / 3)
  expect(testResult.failureClusters[1]).toMatchObject({
    firstObservedAttempt: 3,
    lastObservedAttempt: 3,
    observedRate: 1 / 3,
    occurrences: 1,
    representativeArtifacts: [{ name: "video", path: "artifacts/failure.webm" }],
  })
})

test("native report parser makes absolute identity and evidence paths project-relative", () => {
  const parsed = parseNativeScanReport(report([{
    attachments: [{
      contentType: "application/zip",
      name: "trace",
      path: resolve(PROJECT_ROOT, ".flakelab", "runs", "playwright", "run", "trace.zip"),
    }],
    file: resolve(PROJECT_ROOT, "tests", "checkout.spec.ts"),
    line: 12,
    result: "failed",
    title: "checkout completes",
  }]), PROJECT_ROOT)

  expect(parsed.tests[0].identity.file).toBe("tests/checkout.spec.ts")
  expect(parsed.tests[0].failureClusters[0].representativeArtifacts[0].path).toBe(
    ".flakelab/runs/playwright/run/trace.zip",
  )
})

test("native report parser bounds distinct failure clusters", () => {
  const entries = Array.from({ length: 6 }, (_, index): ReportEntry => ({
    error: `Error: independent failure mode ${index}`,
    line: 12,
    result: "failed",
    title: "checkout completes",
  }))
  const testResult = parseNativeScanReport(report(entries), PROJECT_ROOT).tests[0]

  expect(testResult.failureClusters).toHaveLength(5)
  expect(testResult.multipleFailureModes).toBe(true)
  expect(testResult.omittedFailureModes).toBe(1)
})

test("native report parser uses observed-language outcome labels", () => {
  const parsed = parseNativeScanReport(report([
    { line: 1, result: "passed", title: "passing" },
    { line: 2, result: "failed", title: "failing" },
    { line: 3, result: "skipped", title: "skipped" },
    { line: 4, result: "interrupted", title: "errored" },
  ]), PROJECT_ROOT)

  expect(parsed.tests.map((entry) => entry.status)).toEqual([
    "no-failure-observed",
    "failed-every-run",
    "skipped",
    "errored",
  ])
})

test("native report parser treats an expected Playwright failure as an observed pass", () => {
  const expectedFailure = JSON.stringify({
    errors: [],
    suites: [{
      title: "expected-failure.spec.ts",
      specs: [{
        column: 1,
        file: "expected-failure.spec.ts",
        line: 1,
        tests: [{
          projectName: "chromium",
          results: [{ duration: 1, errors: [{ message: "Error: expected" }], status: "failed" }],
          status: "expected",
        }],
        title: "documents a known defect",
      }],
    }],
  })

  expect(parseNativeScanReport(expectedFailure, PROJECT_ROOT).tests[0]).toMatchObject({
    counts: { errors: 0, failed: 0, passed: 1, skipped: 0 },
    failureClusters: [],
    multipleFailureModes: false,
    omittedFailureModes: 0,
    status: "no-failure-observed",
  })
})

test("native report parser preserves failed and passed attempts from Playwright retries", () => {
  const retriedFailure = JSON.stringify({
    errors: [],
    suites: [{
      title: "retried.spec.ts",
      specs: [{
        column: 1,
        file: "retried.spec.ts",
        line: 1,
        tests: [{
          projectName: "chromium",
          results: [
            { duration: 1, errors: [{ message: "Error: first attempt" }], status: "failed" },
            { duration: 1, errors: [], status: "passed" },
          ],
          status: "flaky",
        }],
        title: "passes on retry",
      }],
    }],
  })

  expect(parseNativeScanReport(retriedFailure, PROJECT_ROOT).tests[0]).toMatchObject({
    counts: { errors: 0, failed: 1, passed: 1, skipped: 0 },
    status: "mixed-outcomes",
  })
})

test("native report parser rejects malformed reports", () => {
  expect(() => parseNativeScanReport("{}", PROJECT_ROOT))
    .toThrow()
  expect(() => parseNativeScanReport("not-json", PROJECT_ROOT))
    .toThrow()
})

test("native arguments preserve paths with spaces and disable retries", () => {
  const arguments_ = nativeScanArguments(
    "C:\\Program Files\\Playwright\\cli.js",
    "tests/checkout flow.spec.ts",
    { runs: 7, workers: 3 },
    "D:\\scan artifacts\\playwright output",
  )

  expect(arguments_).toEqual([
    "C:\\Program Files\\Playwright\\cli.js",
    "test",
    "tests/checkout flow.spec.ts",
    "--repeat-each=7",
    "--workers=3",
    "--retries=0",
    "--reporter=json",
    "--output=D:\\scan artifacts\\playwright output",
  ])
})

async function fakeReporter(path: string, reportText: string): Promise<void> {
  await mkdir(join(path, "fake cli with spaces"), { recursive: true })
  await writeFile(
    join(path, "fake cli with spaces", "playwright cli.mjs"),
    `import { writeFile } from "node:fs/promises"\nawait writeFile(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, ${JSON.stringify(reportText)}, "utf8")\n`,
    "utf8",
  )
}

async function fakeInterruptibleCli(path: string): Promise<string> {
  const cliPath = join(path, "interruptible cli.mjs")
  await mkdir(path, { recursive: true })
  await writeFile(
    cliPath,
    `import { spawn } from "node:child_process"
import { writeFile } from "node:fs/promises"
const worker = spawn(process.execPath, ["-e", "setInterval(() => {}, 1_000)"], { stdio: "ignore" })
await writeFile(process.env.FLAKELAB_TEST_WORKER_PID, String(worker.pid), "utf8")
setInterval(() => {}, 1_000)
`,
    "utf8",
  )
  return cliPath
}

function processExists(processId: number): boolean {
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

function forceTerminate(processId: number): void {
  if (!processExists(processId)) {
    return
  }
  if (process.platform === "win32") {
    spawnSync(TASKKILL_PATH, ["/pid", String(processId), "/t", "/f"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    })
    return
  }
  process.kill(processId, "SIGKILL")
}

test("native runner reads the structured report and cleans its temporary JSON", async ({
  browserName: _browserName,
}, testInfo) => {
  const workspace = testInfo.outputPath("workspace with spaces")
  const temporaryParent = testInfo.outputPath("temporary reports")
  await fakeReporter(workspace, report([
    { line: 12, result: "passed", title: "checkout completes" },
  ]))

  const result = await runNativePlaywrightScan(workspace, "tests/checkout flow.spec.ts", {
    artifactDirectory: testInfo.outputPath("artifacts with spaces"),
    playwrightCliPath: join(workspace, "fake cli with spaces", "playwright cli.mjs"),
    runs: 2,
    temporaryParent,
    workers: 1,
  })

  expect(result.runnerErrors).toEqual([])
  expect(result.tests).toHaveLength(1)
  expect(result.playwrightOutputDirectory).toBeNull()
  expect(await readdir(temporaryParent)).toEqual([])
})

test("native runner reports subprocess failure and still cleans temporary files", async ({
  browserName: _browserName,
}, testInfo) => {
  const workspace = testInfo.outputPath("failed workspace")
  const temporaryParent = testInfo.outputPath("failed temporary reports")
  await mkdir(workspace, { recursive: true })

  const result = await runNativePlaywrightScan(workspace, "tests/missing.spec.ts", {
    artifactDirectory: testInfo.outputPath("failed artifacts"),
    playwrightCliPath: join(workspace, "missing-playwright-cli.mjs"),
    runs: 2,
    temporaryParent,
    workers: 1,
  })

  expect(result.tests).toEqual([])
  expect(result.runnerErrors).toEqual([
    "Playwright produced a missing or malformed JSON report.",
  ])
  expect(await readdir(temporaryParent)).toEqual([])
})

test("interrupting a native scan terminates its descendant process tree", async ({
  browserName: _browserName,
}, testInfo) => {
  const workspace = testInfo.outputPath("interrupted workspace")
  const workerPidPath = testInfo.outputPath("worker.pid")
  const playwrightCliPath = await fakeInterruptibleCli(workspace)
  const controller = new AbortController()
  const previousPidPath = process.env.FLAKELAB_TEST_WORKER_PID
  process.env.FLAKELAB_TEST_WORKER_PID = workerPidPath
  let workerPid = 0
  const scanPromise = runNativePlaywrightScan(workspace, "tests/hangs.spec.ts", {
    artifactDirectory: ".flakelab/artifacts",
    playwrightCliPath,
    runs: 2,
    signal: controller.signal,
    workers: 1,
  })
  try {
    await expect.poll(async () => readFile(workerPidPath, "utf8").catch(() => "")).not.toBe("")
    workerPid = Number(await readFile(workerPidPath, "utf8"))
    expect(processExists(workerPid)).toBe(true)
    controller.abort()

    const result = await scanPromise
    expect(result.runnerErrors).toEqual(["Playwright scan was interrupted."])
    await expect.poll(() => processExists(workerPid)).toBe(false)
  } finally {
    controller.abort()
    await scanPromise.catch(() => undefined)
    forceTerminate(workerPid)
    if (previousPidPath === undefined) {
      delete process.env.FLAKELAB_TEST_WORKER_PID
    } else {
      process.env.FLAKELAB_TEST_WORKER_PID = previousPidPath
    }
  }
})
