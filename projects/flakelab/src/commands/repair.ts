import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { readInvestigationReport } from "../investigator/file.js"
import { createGroqInvestigatorModel } from "../investigator/groq.js"
import { generateCandidatePatch } from "../repair/generator.js"
import type { CandidateGenerationUsage } from "../repair/generator.js"
import { validateProofOfFix } from "../repair/validator.js"
import { readReproducer } from "../reproducer/file.js"
import { requireCredential } from "../security/credentials.js"
import { withSolariTransport } from "../solari/transport.js"
import { formatProviderBoundary } from "../ui/boundary.js"
import { writeStderr } from "../ui/console.js"
import { formatCount } from "../ui/format.js"
import { ProgressReporter } from "../ui/progress.js"
import { stderrTheme } from "../ui/theme.js"
import { formatProofSummary } from "../repair/summary.js"
import type { ProofOfFix } from "../repair/schema.js"
import type { RepairOptions } from "./options.js"
import { integerOption, positiveNumberOption, withInterruption } from "./options.js"

export interface RepairResult {
  proof: ProofOfFix
  usage: CandidateGenerationUsage
}

export async function repair(
  investigationPath: string,
  values: RepairOptions,
): Promise<RepairResult> {
  writeStderr(formatProviderBoundary({
    credentials: ["GROQ_API_KEY", "SOLARI_API_KEY"],
    detail: "Candidate generation sends the investigation summary and approved source"
      + " files to Groq. Proof runs in one disposable Solari microVM that is released"
      + " when the run ends.",
    rows: [
      { label: "Model", value: values.model },
      { label: "Cost ceiling", value: `$${values["max-cost"]}` },
      { label: "Time ceiling", value: `${values["max-seconds"]}s` },
      { label: "Approved source", value: formatCount(values.source.length, "file") },
    ],
    stage: "Groq repair candidate and isolated Solari proof",
  }, stderrTheme()))
  const apiKey = await requireCredential("groq", {
    forcePrompt: values["prompt-credentials"],
  })
  const solariApiKey = await requireCredential("solari", {
    forcePrompt: values["prompt-credentials"],
  })
  const baseUrl = process.env.SOLARI_BASE_URL?.trim() ?? "https://api.getsolari.com"
  const projectRoot = process.cwd()
  const investigation = await readInvestigationReport(resolve(projectRoot, investigationPath))
  const reproducer = await readReproducer(resolve(projectRoot, values.reproducer))
  const patchPath = resolve(projectRoot, values.patch)
  const proofPath = resolve(projectRoot, values.proof)
  const progress = new ProgressReporter()
  progress.start("repair candidate", "policy-bounded generation")
  const result = await withInterruption(async (signal) => {
    const generated = await generateCandidatePatch({
      investigation,
      maxCostUsd: positiveNumberOption(values["max-cost"], "max-cost"),
      maxSeconds: integerOption(values["max-seconds"], "max-seconds"),
      model: createGroqInvestigatorModel(apiKey, values.model),
      projectRoot,
      signal,
      sourcePaths: values.source,
    })
    progress.done(formatCount(generated.candidate.edits.length, "source edit"))
    progress.start("isolated proof", "Solari microVM")
    const validated = await withSolariTransport(async () => validateProofOfFix(
      {
        apiKey: solariApiKey,
        baseUrl,
        candidate: generated.candidate,
        concurrency: integerOption(values.concurrency, "concurrency"),
        projectRoot,
        reproducer,
        signal,
      },
      patchPath,
    ))
    return { ...validated, usage: generated.usage }
  })
  progress.done(result.proof.patchAccepted ? "candidate accepted" : "candidate rejected")
  await writeFile(patchPath, result.diff, "utf8")
  await writeFile(proofPath, `${JSON.stringify(result.proof, null, 2)}\n`, "utf8")
  writeStderr(formatProofSummary(
    result.proof,
    { patch: values.patch, proof: values.proof },
    stderrTheme(),
  ))
  console.log(JSON.stringify({ proofPath, usage: result.usage, ...result.proof }, null, 2))
  if (!result.proof.patchAccepted) {
    process.exitCode = 1
  }
  return { proof: result.proof, usage: result.usage }
}
