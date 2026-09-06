import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import { analyzeBlobReports } from "../analysis/blob-report.js"
import {
  analysisArtifactSchema,
  analysisBaselineSchema,
  type AnalysisArtifact,
  type AnalysisFinding,
} from "../analysis/schema.js"
import { portableProjectPath } from "../artifacts/paths.js"
import type { ScanTestResult } from "../scan/schema.js"
import { formatCount } from "../ui/format.js"
import { ProgressReporter } from "../ui/progress.js"
import { writeStdout } from "../ui/console.js"
import { stdoutTheme } from "../ui/theme.js"
import { formatAnalysisOutput } from "./analyze-summary.js"
import type { AnalyzeOptions } from "./options.js"
import { withInterruption } from "./options.js"
import { classifyScan, scanExitCode, summarizeScanTests } from "./scan.js"

export { formatAnalysisOutput, formatAnalysisSummary } from "./analyze-summary.js"

const MAX_BASELINE_BYTES = 32 * 1_024 * 1_024

function identityKey(test: ScanTestResult): string {
  return JSON.stringify(test.identity)
}

function failureSignatures(test: ScanTestResult): Set<string> {
  return new Set(test.failureClusters.map((cluster) => cluster.signature))
}

function baselineSignatures(tests: ScanTestResult[]): Map<string, Set<string>> {
  return new Map(tests.map((test) => [identityKey(test), failureSignatures(test)]))
}

function findingReasons(
  test: ScanTestResult,
  novelFailureModes: number,
  failureOccurrences: number,
  diagnosticArtifacts: number,
): string[] {
  const reasons: string[] = []
  if (novelFailureModes > 0) {
    reasons.push(`${novelFailureModes} failure mode(s) absent from the baseline`)
  }
  if (test.status === "mixed-outcomes") {
    reasons.push("both passing and failing outcomes were observed")
  }
  if (failureOccurrences > 1) {
    reasons.push(`${failureOccurrences} recurring failure observations`)
  }
  if (diagnosticArtifacts > 0) {
    reasons.push(`${diagnosticArtifacts} representative diagnostic artifact(s)`)
  }
  return reasons.length > 0 ? reasons : ["execution errors require investigation"]
}

function findingScore(
  test: ScanTestResult,
  novelFailureModes: number,
  failureOccurrences: number,
  diagnosticArtifacts: number,
): number {
  const statusScore = test.status === "mixed-outcomes" ? 50 : 20
  return novelFailureModes * 100
    + statusScore
    + Math.min(failureOccurrences, 20)
    + Math.min(diagnosticArtifacts * 3, 15)
}

export function rankAnalysisFindings(
  tests: ScanTestResult[],
  baselineTests?: ScanTestResult[],
): AnalysisFinding[] {
  const baseline = baselineTests ? baselineSignatures(baselineTests) : undefined
  const findings = tests.flatMap((test) => {
    if (test.counts.failed === 0 && test.counts.errors === 0) {
      return []
    }
    const signatures = failureSignatures(test)
    const previous = baseline?.get(identityKey(test))
    const novelFailureModes = baseline
      ? [...signatures].filter((signature) => !previous?.has(signature)).length
      : 0
    const failureOccurrences = test.failureClusters.reduce(
      (total, cluster) => total + cluster.occurrences,
      0,
    )
    const diagnosticArtifacts = test.failureClusters.reduce(
      (total, cluster) => total + cluster.representativeArtifacts.length,
      0,
    )
    return [{
      diagnosticArtifacts,
      failureModes: test.failureClusters.length + test.omittedFailureModes,
      failureOccurrences,
      identity: test.identity,
      novelFailureModes,
      rank: 0,
      reasons: findingReasons(
        test,
        novelFailureModes,
        failureOccurrences,
        diagnosticArtifacts,
      ),
      score: findingScore(test, novelFailureModes, failureOccurrences, diagnosticArtifacts),
      status: test.status,
    }]
  })
  findings.sort((left, right) => (
    right.score - left.score
    || JSON.stringify(left.identity).localeCompare(JSON.stringify(right.identity))
  ))
  return findings.map((finding, index) => ({ ...finding, rank: index + 1 }))
}

async function readBaseline(projectRoot: string, path: string): Promise<ScanTestResult[]> {
  const absolutePath = resolve(projectRoot, path)
  const information = await lstat(absolutePath)
  if (information.isSymbolicLink() || !information.isFile()) {
    throw new Error("Analysis baseline must be a regular JSON artifact")
  }
  if (information.size > MAX_BASELINE_BYTES) {
    throw new Error("Analysis baseline exceeds the 32 MiB safety limit")
  }
  try {
    return analysisBaselineSchema.parse(JSON.parse(await readFile(absolutePath, "utf8"))).tests
  } catch {
    throw new Error("Analysis baseline is not a valid FlakeLab artifact")
  }
}

export async function analyze(source: string, values: AnalyzeOptions): Promise<AnalysisArtifact> {
  const projectRoot = process.cwd()
  const artifactPath = resolve(projectRoot, values.artifacts, "analyze.json")
  const portableArtifactPath = portableProjectPath(projectRoot, artifactPath)
  const baselineTests = values.baseline
    ? await readBaseline(projectRoot, values.baseline)
    : undefined
  const progress = new ProgressReporter()
  progress.start("report analysis", "merging existing Playwright evidence")
  const converted = await withInterruption(async (signal) => analyzeBlobReports(
    projectRoot,
    source,
    { artifactDirectory: values.artifacts, signal },
  ))
  const findings = rankAnalysisFindings(converted.tests, baselineTests)
  const status = classifyScan(converted.tests, converted.runnerErrors)
  const result = analysisArtifactSchema.parse({
    artifactDirectory: converted.artifactDirectory,
    baseline: values.baseline ? portableProjectPath(projectRoot, values.baseline) : null,
    findings,
    generatedAt: new Date().toISOString(),
    recommendedTarget: findings[0]?.identity ?? null,
    runnerErrors: converted.runnerErrors,
    source: {
      archiveCount: converted.archiveCount,
      kind: converted.sourceKind,
      path: portableProjectPath(projectRoot, source),
    },
    status,
    tests: converted.tests,
    totals: summarizeScanTests(converted.tests),
  })
  await mkdir(dirname(artifactPath), { recursive: true })
  await writeFile(artifactPath, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  progress.done(
    `${status} · ${formatCount(result.tests.length, "test")} analyzed`
    + ` · ${formatCount(result.findings.length, "finding")} ranked`,
  )
  writeStdout(formatAnalysisOutput(result, values, portableArtifactPath, stdoutTheme()))
  process.exitCode = scanExitCode(result.status)
  return result
}
