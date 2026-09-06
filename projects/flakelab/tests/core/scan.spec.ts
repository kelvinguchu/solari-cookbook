import { expect, test } from "@playwright/test"

import {
  classifyScan,
  formatScanOutput,
  formatScanSummary,
  scanExitCode,
} from "../../src/commands/scan.js"
import type { ScanResult } from "../../src/commands/scan.js"
import { failureConfidence } from "../../src/runner/native-scan.js"
import { stripAnsi } from "../../src/ui/text.js"
import type { ScanCounts, ScanTestResult, ScanTestStatus } from "../../src/scan/schema.js"

function scanTest(status: ScanTestStatus, counts: ScanCounts, line = 12): ScanTestResult {
  const measured = counts.passed + counts.failed
  const failureClusters: ScanTestResult["failureClusters"] = counts.failed > 0 ? [{
    firstObservedAttempt: 1,
    lastObservedAttempt: counts.failed,
    observedRate: counts.failed / measured,
    occurrences: counts.failed,
    representativeArtifacts: [],
    representativeReason: "Error: representative failure",
    signature: "0000000000000000",
  }] : []
  return {
    counts,
    failureClusters,
    failureRate: measured === 0 ? 0 : counts.failed / measured,
    identity: {
      column: 1,
      file: "tests/checkout.spec.ts",
      line,
      project: "chromium",
      titlePath: ["checkout", `${status}-${line}`],
    },
    ...failureConfidence(counts.failed, measured),
    multipleFailureModes: false,
    omittedFailureModes: 0,
    status,
    trials: measured + counts.skipped + counts.errors,
  }
}

function result(tests: ScanTestResult[], status: ScanResult["status"]): ScanResult {
  const passed = tests.reduce((count, entry) => count + entry.counts.passed, 0)
  const failed = tests.reduce((count, entry) => count + entry.counts.failed, 0)
  const errors = tests.reduce((count, entry) => count + entry.counts.errors, 0)
  const skipped = tests.reduce((count, entry) => count + entry.counts.skipped, 0)
  const confidence = failureConfidence(failed, passed + failed)
  return {
    generatedAt: "2026-09-03T00:00:00.000Z",
    playwrightOutputDirectory: ".flakelab/runs/playwright/run-id",
    runs: 4,
    runnerErrors: [],
    status,
    target: "tests/checkout.spec.ts",
    tests,
    totals: {
      errors,
      executions: passed + failed + errors + skipped,
      failed,
      failureRate: passed + failed === 0 ? 0 : failed / (passed + failed),
      ...confidence,
      passed,
      skipped,
    },
    workers: 1,
  }
}

test("stability scan prioritizes per-test classifications", () => {
  const clean = scanTest("no-failure-observed", { passed: 4, failed: 0, skipped: 0, errors: 0 })
  const mixed = scanTest("mixed-outcomes", { passed: 3, failed: 1, skipped: 0, errors: 0 })
  const failing = scanTest("failed-every-run", {
    passed: 0,
    failed: 4,
    skipped: 0,
    errors: 0,
  })

  expect(classifyScan([clean], [])).toBe("no-failure-observed")
  expect(classifyScan([clean, mixed], [])).toBe("mixed-outcomes")
  expect(classifyScan([clean, failing], [])).toBe("failed-every-run")
  expect(classifyScan([clean], ["report failed"])).toBe("inconclusive")
})

test("stability scan summary gives per-test evidence and the retained artifact path", () => {
  const clean = scanTest("no-failure-observed", { passed: 4, failed: 0, skipped: 0, errors: 0 })
  const summary = formatScanSummary(
    result([clean], "no-failure-observed"),
    ".flakelab/runs/scan.json",
  )

  expect(summary).toContain("No failure was observed")
  expect(summary).toContain("no-failure-observed")
  expect(summary).toContain("0/4 failures observed · 80% upper bound 29.1%")
  expect(summary).toContain("--runs 20")
  expect(summary).toContain(".flakelab/runs/scan.json")
  expect(summary).toContain("Playwright artifacts")
})

test("JSON scan output contains no human-readable banner", () => {
  const clean = scanTest("no-failure-observed", { passed: 4, failed: 0, skipped: 0, errors: 0 })
  const scanResult = result([clean], "no-failure-observed")
  const output = formatScanOutput(
    scanResult,
    { json: true, verbose: false },
    ".flakelab/runs/scan.json",
  )

  expect(JSON.parse(output)).toEqual(scanResult)
  expect(JSON.parse(output)).not.toHaveProperty("artifactPath")
  expect(output).not.toContain("FlakeLab")
  expect(output).not.toContain("Evidence")
  expect(stripAnsi(output)).toBe(output)
})

test("verbose human output appends the structured artifact", () => {
  const clean = scanTest("no-failure-observed", { passed: 4, failed: 0, skipped: 0, errors: 0 })
  const scanResult = result([clean], "no-failure-observed")
  const output = formatScanOutput(
    scanResult,
    { json: false, verbose: true },
    ".flakelab/runs/scan.json",
  )

  expect(output).toContain("FlakeLab · stability scan")
  expect(output).toContain('"status": "no-failure-observed"')
})

test("scan summaries omit empty Playwright artifact locations", () => {
  const clean = scanTest("no-failure-observed", { passed: 4, failed: 0, skipped: 0, errors: 0 })
  const scanResult = result([clean], "no-failure-observed")
  scanResult.playwrightOutputDirectory = null

  const summary = formatScanSummary(scanResult, ".flakelab/runs/scan.json")
  expect(summary).toContain("Scan artifact  .flakelab/runs/scan.json")
  expect(summary).not.toContain("Playwright artifacts")
})

test("scan exit codes distinguish findings from inconclusive infrastructure", () => {
  expect(scanExitCode("no-failure-observed")).toBe(0)
  expect(scanExitCode("mixed-outcomes")).toBe(1)
  expect(scanExitCode("failed-every-run")).toBe(1)
  expect(scanExitCode("inconclusive")).toBe(2)
})

test("scan summaries call out distinct failure modes", () => {
  const mixed = scanTest(
    "mixed-outcomes",
    { passed: 2, failed: 2, skipped: 0, errors: 0 },
  )
  const firstCluster = mixed.failureClusters[0]
  mixed.failureClusters[0] = {
    ...firstCluster,
    lastObservedAttempt: 1,
    observedRate: 0.25,
    occurrences: 1,
  }
  mixed.failureClusters.push({
    ...firstCluster,
    firstObservedAttempt: 4,
    lastObservedAttempt: 4,
    occurrences: 1,
    observedRate: 0.25,
    representativeReason: "Error: independent failure",
    signature: "1111111111111111",
  })
  mixed.multipleFailureModes = true

  expect(formatScanSummary(
    result([mixed], "mixed-outcomes"),
    ".flakelab/runs/scan.json",
  )).toContain(
    "2 distinct failure modes",
  )
})

test("large summaries prioritize problems and collapse clean observations", () => {
  const cleanTests = Array.from({ length: 25 }, (_, index) => scanTest(
    "no-failure-observed",
    { passed: 4, failed: 0, skipped: 0, errors: 0 },
    index + 1,
  ))
  const mixed = scanTest(
    "mixed-outcomes",
    { passed: 3, failed: 1, skipped: 0, errors: 0 },
    30,
  )
  const summary = formatScanSummary(
    result([...cleanTests, mixed], "mixed-outcomes"),
    ".flakelab/runs/scan.json",
  )

  expect(summary).toContain("Problematic tests (showing 1 of 1)")
  expect(summary).toContain("25 tests with no failure observed")
  expect(summary).toContain("use --verbose or --json")
  expect(summary.indexOf("mixed-outcomes")).toBeLessThan(
    summary.indexOf("25 tests with no failure observed"),
  )
  expect(summary).not.toContain("no-failure-observed-1")
})
