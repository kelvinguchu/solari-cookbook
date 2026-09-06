import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { statisticalBisect } from "../bisect/engine.js"
import { resolveGitHistory } from "../bisect/git.js"
import { bisectReportSchema } from "../bisect/schema.js"
import { SolariRevisionEvaluator } from "../bisect/solari-evaluator.js"
import { readReproducer } from "../reproducer/file.js"
import { requireCredential } from "../security/credentials.js"
import { withSolariTransport } from "../solari/transport.js"
import { formatProviderBoundary } from "../ui/boundary.js"
import { writeStderr } from "../ui/console.js"
import { TerminalDocument } from "../ui/document.js"
import { formatCount } from "../ui/format.js"
import { ProgressReporter } from "../ui/progress.js"
import { stderrTheme } from "../ui/theme.js"
import type { BisectOptions } from "./options.js"
import { integerOption, rateOption, withInterruption } from "./options.js"

export async function bisect(values: BisectOptions): Promise<void> {
  writeStderr(formatProviderBoundary({
    credentials: ["SOLARI_API_KEY"],
    detail: "Each candidate revision is checked out and replayed inside a disposable"
      + " Solari sandbox. Sandboxes are released when the run ends.",
    rows: [
      { label: "Good revision", value: values.good },
      { label: "Bad revision", value: values.bad },
      { label: "Parallelism", value: values["bisect-parallelism"] },
      { label: "Trial ceiling", value: values["max-trials"] },
    ],
    stage: "statistical bisect in Solari sandboxes",
  }, stderrTheme()))
  const apiKey = await requireCredential("solari", {
    forcePrompt: values["prompt-credentials"],
  })
  if (!values.good) {
    throw new Error("--good is required")
  }
  const projectRoot = process.cwd()
  const reproducer = await readReproducer(resolve(projectRoot, values.reproducer))
  const history = await resolveGitHistory(projectRoot, values.good, values.bad)
  const reportPath = resolve(projectRoot, values["bisect-report"])
  const minimumFailureRate = rateOption(values["min-rate"])
  const parallelism = integerOption(values["bisect-parallelism"], "bisect-parallelism")
  const totalConcurrency = integerOption(values.concurrency, "concurrency")
  const revisionConcurrency = Math.max(1, Math.floor(totalConcurrency / parallelism))
  const progress = new ProgressReporter()
  progress.start(
    "statistical bisect",
    `${formatCount(history.revisions.length, "historical revision")} in Solari`,
  )
  const report = await withSolariTransport(async () =>
    withInterruption(async (signal) => {
      const evaluator = new SolariRevisionEvaluator({
        apiKey,
        baseUrl: process.env.SOLARI_BASE_URL?.trim() ?? "https://api.getsolari.com",
        concurrency: revisionConcurrency,
        maxTrials: integerOption(values["max-trials"], "max-trials"),
        minimumFailureRate,
        projectPath: history.projectPath,
        repositoryRoot: history.repositoryRoot,
        reproducer,
        signal,
      })
      try {
        return await statisticalBisect({
          evaluate: evaluator.evaluate,
          minimumFailureRate,
          parallelism,
          revisions: history.revisions,
        })
      } finally {
        await evaluator.dispose()
      }
    }),
  )
  const validated = bisectReportSchema.parse(report)
  await writeFile(reportPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8")
  const commit = validated.exact
    ? validated.firstFailingCommit?.shortHash ?? "unavailable"
    : validated.earliestKnownBadCommit.shortHash
  progress.done(validated.exact
    ? `first failing commit ${commit}`
    : `earliest proven bad commit ${commit}`)
  writeStderr(new TerminalDocument(stderrTheme())
    .entry(
      validated.exact ? "success" : "inconclusive",
      validated.exact ? "introducing commit identified" : "bisect narrowed but not exact",
      validated.exact
        ? "One commit separates a proven good revision from a proven bad revision."
        : "The search stopped before isolating a single introducing commit.",
    )
    .rows([
      { label: "Commit", value: commit },
      { label: "Evidence", value: values["bisect-report"] },
    ])
    .render())
  console.log(JSON.stringify({ reportPath, ...validated }, null, 2))
  if (!validated.exact) {
    process.exitCode = 2
  }
}
