import type { StatusTone } from "../ui/status.js"
import type { DocumentRow } from "../ui/document.js"
import { TerminalDocument } from "../ui/document.js"
import { formatCount, formatRate, shellArgument } from "../ui/format.js"
import type { TerminalTheme } from "../ui/theme.js"
import { PLAIN_THEME } from "../ui/theme.js"
import type { ScanArtifact, ScanCounts, ScanStatus, ScanTestResult } from "../scan/schema.js"
import type { ScanOptions } from "./options.js"

const SUMMARY_TEST_LIMIT = 20

const STATUS_TONES: Record<ScanStatus | "errored" | "skipped", StatusTone> = {
  errored: "inconclusive",
  "failed-every-run": "failure",
  inconclusive: "inconclusive",
  "mixed-outcomes": "warning",
  "no-failure-observed": "success",
  skipped: "muted",
}

const FINDINGS: Record<ScanStatus, string> = {
  "failed-every-run": "At least one test failed in every measured run; this looks like a regular test failure.",
  inconclusive: "The scan was inconclusive because Playwright or one or more tests could not run.",
  "mixed-outcomes": "Mixed outcomes observed: at least one test both passed and failed.",
  "no-failure-observed": "No failure was observed in this bounded scan.",
}

const TEST_STATUS_PRIORITY: Record<ScanTestResult["status"], number> = {
  errored: 0,
  "mixed-outcomes": 1,
  "failed-every-run": 2,
  skipped: 3,
  "no-failure-observed": 4,
}

export function finding(status: ScanStatus): string {
  return FINDINGS[status]
}

export function failureEvidence(
  failed: number,
  passed: number,
  lowerBound80: number,
  upperBound80: number,
): string {
  const measured = failed + passed
  if (measured === 0) {
    return "no measured pass/fail trials"
  }
  if (failed === 0) {
    return `0/${measured} failures observed · 80% upper bound ${formatRate(upperBound80)}`
  }
  if (passed === 0) {
    return `${failed}/${measured} failures observed · 80% lower bound ${formatRate(lowerBound80)}`
  }
  return `${failed}/${measured} failures observed · 80% interval ${formatRate(lowerBound80)}–${formatRate(upperBound80)}`
}

function additionalOutcomes(counts: ScanCounts): string {
  const outcomes: string[] = []
  if (counts.skipped > 0) {
    outcomes.push(`${counts.skipped} skipped`)
  }
  if (counts.errors > 0) {
    outcomes.push(`${counts.errors} errors`)
  }
  return outcomes.length > 0 ? ` · ${outcomes.join(" · ")}` : ""
}

function failureModes(test: ScanTestResult): string {
  if (test.failureClusters.length === 0) {
    return ""
  }
  const modeCount = test.failureClusters.length + test.omittedFailureModes
  const label = test.multipleFailureModes ? "distinct failure modes" : "failure mode"
  return ` · ${modeCount} ${label}`
}

function compareSummaryOrder(left: ScanTestResult, right: ScanTestResult): number {
  const priority = TEST_STATUS_PRIORITY[left.status] - TEST_STATUS_PRIORITY[right.status]
  if (priority !== 0) {
    return priority
  }
  return testIdentity(left).localeCompare(testIdentity(right))
}

function testIdentity(test: ScanTestResult): string {
  const { column, file, line, project, titlePath } = test.identity
  return `${file}:${line}:${column}:${project}:${titlePath.join(":")}`
}

function isProblematic(test: ScanTestResult): boolean {
  return test.status !== "no-failure-observed" && test.status !== "skipped"
}

function appendTest(document: TerminalDocument, test: ScanTestResult): void {
  const { column, file, line, project, titlePath } = test.identity
  document.entry(STATUS_TONES[test.status], `${test.status} · ${project}`)
  document.detail(`${file}:${line}:${column} › ${titlePath.join(" › ")}`)
  const evidence = failureEvidence(
    test.counts.failed,
    test.counts.passed,
    test.lowerBound80,
    test.upperBound80,
  )
  document.detail(`${evidence}${failureModes(test)}${additionalOutcomes(test.counts)}`)
}

function appendCollapsedTests(
  document: TerminalDocument,
  tests: ScanTestResult[],
  ordered: ScanTestResult[],
  artifactPath: string,
): void {
  const problematic = ordered.filter(isProblematic)
  const displayed = problematic.slice(0, SUMMARY_TEST_LIMIT)
  document.section(`Problematic tests (showing ${displayed.length} of ${problematic.length})`)
  if (displayed.length === 0) {
    document.entry("muted", "None observed")
  }
  for (const test of displayed) {
    appendTest(document, test)
  }
  const omitted = problematic.length - displayed.length
  if (omitted > 0) {
    document.entry("muted", `${omitted} additional problematic tests omitted from this summary.`)
  }
  const clean = tests.filter((test) => test.status === "no-failure-observed").length
  const skipped = tests.filter((test) => test.status === "skipped").length
  document.entry("muted", `${clean} tests with no failure observed · ${skipped} skipped`)
  document.entry(
    "muted",
    `Complete per-test evidence is in ${artifactPath}; use --verbose or --json to print it.`,
  )
}

function appendTests(
  document: TerminalDocument,
  tests: ScanTestResult[],
  artifactPath: string,
): void {
  const ordered = [...tests].sort(compareSummaryOrder)
  if (ordered.length > SUMMARY_TEST_LIMIT) {
    appendCollapsedTests(document, tests, ordered, artifactPath)
    return
  }
  document.section("Tests")
  for (const test of ordered) {
    appendTest(document, test)
  }
}

function nextCommand(scan: ScanArtifact): string | undefined {
  const target = shellArgument(scan.target)
  if (scan.status === "no-failure-observed") {
    return `flakelab scan ${target} --runs 20`
  }
  if (scan.status === "mixed-outcomes") {
    return `flakelab diagnose ${target} --discover`
  }
  if (scan.status === "inconclusive") {
    return "flakelab doctor"
  }
  return undefined
}

function overviewRows(scan: ScanArtifact): DocumentRow[] {
  const counts = scan.totals
  return [
    { label: "Target", value: scan.target },
    {
      label: "Scan",
      value: `${formatCount(scan.runs, "run")} · ${formatCount(scan.workers, "worker")}`
        + ` · ${formatCount(scan.tests.length, "test")}`,
    },
    {
      label: "Outcomes",
      value: `${counts.passed} passed · ${counts.failed} failed · ${counts.skipped} skipped · ${counts.errors} errors`,
    },
    {
      label: "Confidence",
      value: failureEvidence(
        counts.failed,
        counts.passed,
        counts.lowerBound80,
        counts.upperBound80,
      ),
    },
  ]
}

export function formatScanSummary(
  scan: ScanArtifact,
  artifactPath: string,
  theme: TerminalTheme = PLAIN_THEME,
): string {
  const document = new TerminalDocument(theme)
  document.heading("stability scan")
  document.verdict(STATUS_TONES[scan.status], scan.status, finding(scan.status))
  document.blank().rows(overviewRows(scan))
  appendTests(document, scan.tests, artifactPath)
  if (scan.runnerErrors.length > 0) {
    document.section("Runner errors")
    for (const error of scan.runnerErrors) {
      document.entry("failure", error)
    }
  }
  document.section("Evidence")
  const evidence: DocumentRow[] = [{ label: "Scan artifact", value: artifactPath }]
  if (scan.playwrightOutputDirectory) {
    evidence.push({ label: "Playwright artifacts", value: scan.playwrightOutputDirectory })
  }
  document.rows(evidence)
  const next = nextCommand(scan)
  if (next) {
    document.section("Next").command(next)
  }
  return document.render()
}

export function formatScanOutput(
  scanResult: ScanArtifact,
  values: Pick<ScanOptions, "json" | "verbose">,
  artifactPath: string,
  theme: TerminalTheme = PLAIN_THEME,
): string {
  const evidence = JSON.stringify(scanResult, null, 2)
  if (values.json) {
    return evidence
  }
  const summary = formatScanSummary(scanResult, artifactPath, theme)
  return values.verbose ? `${summary}\n\n${evidence}` : summary
}
