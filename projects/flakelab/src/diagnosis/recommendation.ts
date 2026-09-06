import type { DiagnoseOptions } from "../commands/options.js"
import { integerOption, positiveNumberOption } from "../commands/options.js"
import { networkDelayTrialBound } from "../discovery/minimize.js"
import type { ScanStatus } from "../scan/schema.js"
import { buildDiscoveryBudget } from "./discovery-budget.js"
import type {
  DiagnosisRecommendation,
  DiagnosisStage,
} from "./schema.js"

interface RecommendationInput {
  elapsedMilliseconds: number
  observedRuns: number
  stage: DiagnosisStage
  status: ScanStatus
  target?: string
  values: DiagnoseOptions
}

function quoted(value: string): string {
  return JSON.stringify(value)
}

function discoveryTrialBound(values: DiagnoseOptions): number {
  const trials = integerOption(values.trials, "trials")
  const maximumDelay = integerOption(values["max-delay"], "max-delay")
  return networkDelayTrialBound(trials, maximumDelay)
}

function formattedDuration(seconds: number): string {
  if (seconds < 60) {
    return `about ${Math.max(1, seconds)} second(s)`
  }
  return `about ${Math.ceil(seconds / 60)} minute(s)`
}

function expectedDuration(
  elapsedMilliseconds: number,
  observedRuns: number,
  plannedTrials: number,
  concurrency: number,
): string {
  if (elapsedMilliseconds === 0 || observedRuns === 0) {
    return `${plannedTrials} normal target run(s); no runtime sample is available yet`
  }
  if (plannedTrials === 0) {
    return formattedDuration(1)
  }
  const budget = buildDiscoveryBudget({
    concurrency,
    configuredSeconds: 0,
    elapsedMilliseconds,
    observedRuns,
    plannedTrials,
  })
  return `up to ${Math.ceil(budget.recommendedSeconds / 60)} minute(s)`
}

function localRecommendation(
  input: RecommendationInput,
  plannedTrials: number,
  command: string | null,
  rationale: string,
): DiagnosisRecommendation {
  return {
    aiCostLimitUsd: null,
    command,
    credentials: [],
    expectedDuration: expectedDuration(
      input.elapsedMilliseconds,
      input.observedRuns,
      plannedTrials,
      integerOption(input.values.concurrency, "concurrency"),
    ),
    plannedTrials,
    rationale,
    solariCostEstimateUsd: 0,
    solariCostNote: "No Solari operation is planned; estimated Solari cost is $0.",
  }
}

function observedRecommendation(input: RecommendationInput): DiagnosisRecommendation {
  const target = input.target ?? "<test-target>"
  if (input.status === "no-failure-observed") {
    const plannedTrials = discoveryTrialBound(input.values)
    return localRecommendation(
      input,
      plannedTrials,
      `flakelab diagnose ${quoted(target)} --discover`,
      "The bounded control was clean; minimize one deterministic network-delay trigger next.",
    )
  }
  if (input.status === "mixed-outcomes") {
    const plannedTrials = discoveryTrialBound(input.values)
    return localRecommendation(
      input,
      plannedTrials,
      `flakelab diagnose ${quoted(target)} --discover`,
      "The uncontrolled failure already reproduces; interleave controls and interventions to test whether a fault significantly amplifies the same signature.",
    )
  }
  if (input.status === "failed-every-run") {
    return localRecommendation(
      input,
      0,
      null,
      "This is currently a consistent failure; fix the ordinary failure before flake experiments.",
    )
  }
  return localRecommendation(
    input,
    0,
    null,
    "Repair the Playwright or test infrastructure error before collecting causal evidence.",
  )
}

export function buildDiagnosisRecommendation(
  input: RecommendationInput,
): DiagnosisRecommendation {
  if (input.stage === "observed") {
    return observedRecommendation(input)
  }
  if (input.stage === "reproducer-created") {
    return {
      aiCostLimitUsd: positiveNumberOption(input.values["max-cost"], "max-cost"),
      command: input.target
        ? `flakelab diagnose ${quoted(input.target)} --investigate`
        : null,
      credentials: ["GROQ_API_KEY"],
      expectedDuration: `bounded to ${input.values["max-seconds"]} second(s) of investigator time`,
      plannedTrials: integerOption(input.values["max-trials"], "max-trials"),
      rationale: "The minimized trigger is ready for evidence-bounded hypothesis testing.",
      solariCostEstimateUsd: 0,
      solariCostNote: "Investigation does not use Solari; estimated Solari cost is $0.",
    }
  }
  if (input.stage === "investigated") {
    return {
      aiCostLimitUsd: null,
      command: input.target ? `flakelab diagnose ${quoted(input.target)} --repair` : null,
      credentials: ["GROQ_API_KEY", "SOLARI_API_KEY"],
      expectedDuration: "candidate generation plus one bounded Solari proof matrix",
      plannedTrials: integerOption(input.values["max-trials"], "max-trials"),
      rationale: "The causal evidence is ready for an optional candidate repair and proof.",
      solariCostEstimateUsd: null,
      solariCostNote: "No reliable Solari cost estimate is available before the proof run.",
    }
  }
  return {
    aiCostLimitUsd: null,
    command: null,
    credentials: [],
    expectedDuration: "complete",
    plannedTrials: 0,
    rationale: input.stage === "repair-proven"
      ? "The candidate passed the isolated proof matrix."
      : "The candidate was rejected; use the retained evidence to revise the repair.",
    solariCostEstimateUsd: null,
    solariCostNote: "Actual provider usage is retained with the completed evidence.",
  }
}
