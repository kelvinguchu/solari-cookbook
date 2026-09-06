import { resolve } from "node:path"

import { evaluateExperiment } from "../discovery/evaluate.js"
import { readReproducer } from "../reproducer/file.js"
import { createPlaywrightExecutor } from "../runner/playwright-executor.js"
import { writeStderr } from "../ui/console.js"
import { TerminalDocument } from "../ui/document.js"
import { stderrTheme } from "../ui/theme.js"
import type { ReplayOptions } from "./options.js"
import { integerOption, withInterruption } from "./options.js"

interface ReplayVerdict {
  failed: number
  path: string
  reproduced: boolean
  signatureMatches: boolean
  test: string
  trials: number
}

function replaySummary(verdict: ReplayVerdict): string {
  const document = new TerminalDocument(stderrTheme())
  document.entry(
    verdict.reproduced ? "success" : "failure",
    verdict.reproduced ? "reproducer confirmed" : "reproducer not confirmed",
    `${verdict.failed}/${verdict.trials} trials failed · recorded signature`
    + ` ${verdict.signatureMatches ? "matched" : "did not match"}`,
  )
  return document.rows([
    { label: "Reproducer", value: verdict.path },
    { label: "Test", value: verdict.test },
  ]).render()
}

export async function replay(filePath: string, values: ReplayOptions): Promise<void> {
  const projectRoot = process.cwd()
  const reproducer = await readReproducer(resolve(projectRoot, filePath))
  const result = await withInterruption(async (signal) => evaluateExperiment(
    createPlaywrightExecutor(projectRoot, reproducer.test, { signal }),
    {
      concurrency: integerOption(values.concurrency, "concurrency"),
      faults: reproducer.faults,
      minimumFailureRate: reproducer.expectedFailure.minimumRate,
      seed: reproducer.seed,
      signal,
      trials: reproducer.trials,
    },
  ))
  const signatureMatches = !reproducer.expectedFailure.signature
    || reproducer.expectedFailure.signature === result.dominantFailureSignature
  const reproduced = result.confirmed && signatureMatches
  writeStderr(replaySummary(
    { failed: result.failed, path: filePath, reproduced, signatureMatches, test: reproducer.test,
      trials: result.trials },
  ))
  console.log(JSON.stringify({ reproduced, signatureMatches, result }, null, 2))
  if (!reproduced) {
    process.exitCode = 1
  }
}
