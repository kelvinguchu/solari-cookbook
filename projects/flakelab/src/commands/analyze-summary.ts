import type { AnalysisArtifact, AnalysisFinding } from "../analysis/schema.js"
import type { DocumentRow } from "../ui/document.js"
import { TerminalDocument } from "../ui/document.js"
import { formatCount, shellArgument } from "../ui/format.js"
import type { StatusTone } from "../ui/status.js"
import type { TerminalTheme } from "../ui/theme.js"
import { PLAIN_THEME } from "../ui/theme.js"
import type { ScanStatus } from "../scan/schema.js"
import { failureEvidence, finding } from "./scan-summary.js"
import type { AnalyzeOptions } from "./options.js"

const SUMMARY_FINDING_LIMIT = 10

const STATUS_TONES: Record<ScanStatus | "errored" | "skipped", StatusTone> = {
  errored: "inconclusive",
  "failed-every-run": "failure",
  inconclusive: "inconclusive",
  "mixed-outcomes": "warning",
  "no-failure-observed": "success",
  skipped: "muted",
}

function appendFinding(document: TerminalDocument, entry: AnalysisFinding): void {
  const { column, file, line, project, titlePath } = entry.identity
  document.entry(STATUS_TONES[entry.status], `${entry.rank}. ${entry.status} · ${project}`)
  document.detail(`${file}:${line}:${column} › ${titlePath.join(" › ")}`)
  document.detail(entry.reasons.join(" · "))
}

function overviewRows(result: AnalysisArtifact): DocumentRow[] {
  const totals = result.totals
  return [
    { label: "Source", value: result.source.path },
    {
      label: "Merged",
      value: `${formatCount(result.source.archiveCount, "archive")}`
        + ` · ${formatCount(result.tests.length, "test")}`,
    },
    {
      label: "Outcomes",
      value: `${totals.passed} passed · ${totals.failed} failed`
        + ` · ${totals.skipped} skipped · ${totals.errors} errors`,
    },
    {
      label: "Confidence",
      value: failureEvidence(
        totals.failed,
        totals.passed,
        totals.lowerBound80,
        totals.upperBound80,
      ),
    },
    { label: "Findings", value: `${result.findings.length}` },
  ]
}

function appendFindings(document: TerminalDocument, result: AnalysisArtifact): void {
  if (result.findings.length === 0) {
    document.section("Findings")
    document.entry("success", "No failing or errored test results were found in this report.")
    return
  }
  document.section("Recommended investigation targets")
  for (const entry of result.findings.slice(0, SUMMARY_FINDING_LIMIT)) {
    appendFinding(document, entry)
  }
  const omitted = result.findings.length - SUMMARY_FINDING_LIMIT
  if (omitted > 0) {
    document.entry("muted", `${omitted} additional finding(s) are available in the JSON artifact.`)
  }
}

export function formatAnalysisSummary(
  result: AnalysisArtifact,
  artifactPath: string,
  theme: TerminalTheme = PLAIN_THEME,
): string {
  const document = new TerminalDocument(theme)
  document.heading("report analysis")
  document.verdict(STATUS_TONES[result.status], result.status, finding(result.status))
  document.blank().rows(overviewRows(result))
  appendFindings(document, result)
  if (result.runnerErrors.length > 0) {
    document.section("Runner errors")
    for (const error of result.runnerErrors) {
      document.entry("failure", error)
    }
  }
  document.section("Evidence")
  const evidence: DocumentRow[] = [{ label: "Analysis artifact", value: artifactPath }]
  if (result.artifactDirectory) {
    evidence.push({ label: "Playwright artifacts", value: result.artifactDirectory })
  }
  document.rows(evidence)
  const target = result.recommendedTarget
  if (target) {
    document.section("Next")
    document.command(`flakelab diagnose ${shellArgument(target.file)} --discover`)
  }
  return document.render()
}

export function formatAnalysisOutput(
  result: AnalysisArtifact,
  values: Pick<AnalyzeOptions, "json" | "verbose">,
  artifactPath: string,
  theme: TerminalTheme = PLAIN_THEME,
): string {
  const json = JSON.stringify(result, null, 2)
  if (values.json) {
    return json
  }
  const summary = formatAnalysisSummary(result, artifactPath, theme)
  return values.verbose ? `${summary}\n\n${json}` : summary
}
