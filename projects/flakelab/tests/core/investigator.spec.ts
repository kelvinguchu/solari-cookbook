import { expect, test } from "@playwright/test"

import { InvestigationBudget } from "../../src/investigator/budget.js"
import { InvestigationLedger } from "../../src/investigator/ledger.js"
import { experimentConditionSchema } from "../../src/investigator/schema.js"

const passingResult = {
  confirmed: false,
  errors: 0,
  failed: 0,
  failureRate: 0,
  failureSignatures: [],
  lowerBound80: 0,
  passed: 4,
  representativeRuns: [],
  trials: 4,
  upperBound80: 0.2911,
}

const failingResult = {
  confirmed: true,
  dominantFailureSignature: "checkout-timeout",
  errors: 0,
  failed: 4,
  failureRate: 1,
  failureSignatures: [{
    failures: 4,
    failureRate: 1,
    lowerBound80: 0.7089,
    signature: "checkout-timeout",
    upperBound80: 1,
  }],
  lowerBound80: 0.7089,
  passed: 0,
  representativeRuns: [],
  trials: 4,
  upperBound80: 1,
}

test("ledger accepts only an evidence-grounded causal conclusion", () => {
  const ledger = new InvestigationLedger()
  const timing = ledger.propose(
    "Checkout has a timing race",
    "Network delay will cause the assertion to fail",
  )
  const status = ledger.propose(
    "Checkout mishandles HTTP status",
    "An injected 503 response will cause the assertion to fail",
  )
  ledger.addExperiment(timing.id, { kind: "baseline" }, passingResult)
  const statusEvidence = ledger.addExperiment(
    status.id,
    { kind: "request-failure", statusCode: 503 },
    passingResult,
  )
  const timingEvidence = ledger.addExperiment(
    timing.id,
    { kind: "network-delay", delayMs: 125 },
    failingResult,
  )

  ledger.assess(timing.id, "confirmed", [timingEvidence.id], "Delay changed failure rate")
  ledger.assess(status.id, "rejected", [statusEvidence.id], "HTTP status did not cause failure")
  ledger.conclude(
    timing.id,
    "Network delay confirms that checkout has a timing race",
    [timingEvidence.id],
  )

  const report = ledger.buildReport("tests/checkout.spec.ts", "test-model", [
    "tests/checkout.spec.ts",
    "src/checkout.ts",
  ], {
    inputTokens: 100,
    outputTokens: 50,
    estimatedCostUsd: 0.001,
  })
  expect(report.hypotheses).toHaveLength(2)
  expect(report.conclusionHypothesisId).toBe("H1")
  expect(report.conclusionEvidenceIds).toEqual(["E3"])
})

test("ledger rejects confirmation without a causal intervention", () => {
  const ledger = new InvestigationLedger()
  const hypothesis = ledger.propose(
    "Checkout has a timing race",
    "Network delay will cause the assertion to fail",
  )
  const baseline = ledger.addExperiment(hypothesis.id, { kind: "baseline" }, passingResult)

  expect(() => ledger.assess(
    hypothesis.id,
    "confirmed",
    [baseline.id],
    "Baseline evidence is not causal",
  )).toThrow(/Confirmation requires/u)
})

test("experiment budget prevents unbounded model-selected work", () => {
  const budget = new InvestigationBudget({
    maxCostUsd: 0.25,
    maxExperiments: 1,
    maxSeconds: 60,
    maxTrials: 4,
  })
  budget.reserveExperiment(4)

  expect(() => {
    budget.reserveExperiment(4)
  }).toThrow(/experiment budget exhausted/u)
})

test("investigator conditions validate bounded value-free faults", () => {
  expect(experimentConditionSchema.parse({
    kind: "auth-cookie-expiry",
    cookieName: "session-id",
  })).toEqual({ kind: "auth-cookie-expiry", cookieName: "session-id" })
  expect(experimentConditionSchema.safeParse({
    kind: "auth-cookie-expiry",
    cookieName: "cookie with value=secret",
  }).success).toBe(false)
  expect(experimentConditionSchema.parse({
    kind: "clock-jump",
    jumpAfterMs: 25,
    offsetMs: -3_600_000,
  })).toEqual({ kind: "clock-jump", jumpAfterMs: 25, offsetMs: -3_600_000 })
  expect(experimentConditionSchema.safeParse({
    kind: "clock-jump",
    jumpAfterMs: 25,
    offsetMs: 0,
  }).success).toBe(false)
  expect(experimentConditionSchema.parse({ kind: "locale", locale: "fr-FR" }))
    .toEqual({ kind: "locale", locale: "fr-FR" })
  expect(experimentConditionSchema.parse({
    kind: "timezone",
    timezoneId: "America/New_York",
  })).toEqual({ kind: "timezone", timezoneId: "America/New_York" })
  expect(experimentConditionSchema.parse({ kind: "animation-speed", rate: 5 }))
    .toEqual({ kind: "animation-speed", rate: 5 })
  expect(experimentConditionSchema.parse({ kind: "reduced-motion" }))
    .toEqual({ kind: "reduced-motion" })
  expect(experimentConditionSchema.parse({ kind: "viewport", width: 375, height: 667 }))
    .toEqual({ kind: "viewport", width: 375, height: 667 })
  expect(experimentConditionSchema.parse({ kind: "worker-pressure", workers: 4 }))
    .toEqual({ kind: "worker-pressure", workers: 4 })
  expect(experimentConditionSchema.parse({ kind: "shared-state-interference", copies: 3 }))
    .toEqual({ kind: "shared-state-interference", copies: 3 })
  expect(experimentConditionSchema.parse({
    kind: "event-loop-stall",
    durationMs: 500,
    startAfterMs: 0,
  })).toEqual({ kind: "event-loop-stall", durationMs: 500, startAfterMs: 0 })
  expect(experimentConditionSchema.safeParse({
    kind: "event-loop-stall",
    durationMs: 2_001,
    startAfterMs: 0,
  }).success).toBe(false)
  expect(experimentConditionSchema.parse({
    kind: "response-truncation",
    removeBytes: 1_024,
  })).toEqual({ kind: "response-truncation", removeBytes: 1_024 })
  expect(experimentConditionSchema.safeParse({
    kind: "response-truncation",
    removeBytes: 1_025,
  }).success).toBe(false)
  expect(experimentConditionSchema.parse({
    kind: "response-duplication",
    duplicateBytes: 1_024,
  })).toEqual({ kind: "response-duplication", duplicateBytes: 1_024 })
  expect(experimentConditionSchema.safeParse({
    kind: "response-duplication",
    duplicateBytes: 1_025,
  }).success).toBe(false)
  expect(experimentConditionSchema.parse({
    kind: "response-reordering",
    holdMs: 30_000,
  })).toEqual({ kind: "response-reordering", holdMs: 30_000 })
  expect(experimentConditionSchema.safeParse({
    kind: "response-reordering",
    holdMs: 30_001,
  }).success).toBe(false)
  expect(experimentConditionSchema.parse({
    kind: "resource-loading-delay",
    delayMs: 100,
    resourceType: "script",
  })).toEqual({ kind: "resource-loading-delay", delayMs: 100, resourceType: "script" })
  expect(experimentConditionSchema.safeParse({
    kind: "resource-loading-delay",
    delayMs: 100,
    resourceType: "fetch",
  }).success).toBe(false)
  expect(experimentConditionSchema.parse({
    kind: "startup-event-delay",
    delayMs: 100,
    event: "dom-content-loaded",
  })).toEqual({ kind: "startup-event-delay", delayMs: 100, event: "dom-content-loaded" })
  expect(experimentConditionSchema.safeParse({
    kind: "startup-event-delay",
    delayMs: 100,
    event: "ready",
  }).success).toBe(false)
  expect(experimentConditionSchema.parse({
    kind: "storage-state-delay",
    delayMs: 100,
    key: "auth-state",
    storage: "local-storage",
  })).toEqual({
    kind: "storage-state-delay",
    delayMs: 100,
    key: "auth-state",
    storage: "local-storage",
  })
})
