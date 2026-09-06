import { parseArgs } from "node:util"

import type { DiagnoseOptions } from "../commands/options.js"

export interface DiagnoseInvocation {
  command: "diagnose"
  options: DiagnoseOptions
  target?: string
}

function withDefault<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value
}

export function parseDiagnoseArguments(args: string[]): DiagnoseInvocation {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      artifacts: { type: "string", default: ".flakelab/runs" },
      baseline: { type: "string" },
      concurrency: { type: "string", default: "1" },
      discover: { type: "boolean", default: false },
      evidence: { type: "string", default: "flakelab.investigation.json" },
      html: { type: "string", default: "flakelab.report.html" },
      investigate: { type: "boolean", default: false },
      "max-cost": { type: "string", default: "0.25" },
      "max-delay": { type: "string", default: "250" },
      "max-experiments": { type: "string", default: "3" },
      "max-seconds": { type: "string", default: "90" },
      "max-steps": { type: "string", default: "3" },
      "max-trials": { type: "string", default: "12" },
      "min-rate": { type: "string", default: "0.7" },
      model: { type: "string", default: "qwen/qwen3.8-27b" },
      open: { type: "boolean", default: false },
      patch: { type: "string", default: "candidate.diff" },
      pattern: { type: "string", default: "**/api/checkout" },
      proof: { type: "string", default: "flakelab.proof.json" },
      "prompt-credentials": { type: "boolean", default: false },
      repair: { type: "boolean", default: false },
      report: { type: "string" },
      reproducer: { type: "string", default: "flakelab.repro.yaml" },
      runs: { type: "string", default: "4" },
      seed: { type: "string", default: "1" },
      source: { type: "string", multiple: true, default: [] },
      trials: { type: "string", default: "4" },
    },
  })
  if (parsed.positionals.length > 1) {
    throw new Error("diagnose accepts at most one test target")
  }
  const target = parsed.positionals[0]
  if (!target && !parsed.values.report) {
    throw new Error("diagnose requires a test target or --report <blob-report>")
  }
  if (!target && (parsed.values.discover || parsed.values.investigate || parsed.values.repair)) {
    throw new Error("diagnose needs an explicit test target before running new experiments")
  }
  return {
    command: "diagnose",
    ...(target ? { target } : {}),
    options: {
      artifacts: withDefault(parsed.values.artifacts, ".flakelab/runs"),
      baseline: parsed.values.baseline,
      concurrency: withDefault(parsed.values.concurrency, "1"),
      discover: withDefault(parsed.values.discover, false),
      evidence: withDefault(parsed.values.evidence, "flakelab.investigation.json"),
      html: withDefault(parsed.values.html, "flakelab.report.html"),
      investigate: withDefault(parsed.values.investigate, false),
      "max-cost": withDefault(parsed.values["max-cost"], "0.25"),
      "max-delay": withDefault(parsed.values["max-delay"], "250"),
      "max-experiments": withDefault(parsed.values["max-experiments"], "3"),
      "max-seconds": withDefault(parsed.values["max-seconds"], "90"),
      "max-steps": withDefault(parsed.values["max-steps"], "3"),
      "max-trials": withDefault(parsed.values["max-trials"], "12"),
      "min-rate": withDefault(parsed.values["min-rate"], "0.7"),
      model: withDefault(parsed.values.model, "qwen/qwen3.8-27b"),
      open: withDefault(parsed.values.open, false),
      patch: withDefault(parsed.values.patch, "candidate.diff"),
      pattern: withDefault(parsed.values.pattern, "**/api/checkout"),
      proof: withDefault(parsed.values.proof, "flakelab.proof.json"),
      "prompt-credentials": withDefault(parsed.values["prompt-credentials"], false),
      repair: withDefault(parsed.values.repair, false),
      report: parsed.values.report,
      reproducer: withDefault(parsed.values.reproducer, "flakelab.repro.yaml"),
      runs: withDefault(parsed.values.runs, "4"),
      seed: withDefault(parsed.values.seed, "1"),
      source: parsed.values.source ?? [],
      trials: withDefault(parsed.values.trials, "4"),
    },
  }
}
