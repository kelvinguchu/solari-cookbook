import { parseArgs } from "node:util"

import type { AnalyzeOptions } from "../commands/options.js"

export interface AnalyzeInvocation {
  command: "analyze"
  options: AnalyzeOptions
  target: string
}

export function parseAnalyzeArguments(args: string[]): AnalyzeInvocation {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      artifacts: { type: "string", default: ".flakelab/runs" },
      baseline: { type: "string" },
      json: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
    },
  })
  if (parsed.positionals.length !== 1) {
    throw new Error("analyze requires exactly one blob report path")
  }
  return {
    command: "analyze",
    options: {
      artifacts: parsed.values.artifacts ?? ".flakelab/runs",
      baseline: parsed.values.baseline,
      json: parsed.values.json ?? false,
      verbose: parsed.values.verbose ?? false,
    },
    target: parsed.positionals[0],
  }
}
