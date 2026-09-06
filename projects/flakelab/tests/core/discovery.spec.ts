import { expect, test } from "@playwright/test"

import { buildDiscoveredReproducer } from "../../src/commands/discover.js"
import { discoverAuthCookieExpiry } from "../../src/discovery/auth-cookie.js"
import { discoverEventLoopStall } from "../../src/discovery/event-loop.js"
import { evaluateExperiment } from "../../src/discovery/evaluate.js"
import {
  discoverNetworkDelay,
  discoverResponseDuplication,
  discoverResponseReordering,
  discoverResponseTruncation,
  minimizeItems,
} from "../../src/discovery/minimize.js"
import { discoverResourceLoadingDelay } from "../../src/discovery/resource-loading.js"
import { discoverStartupEventDelay } from "../../src/discovery/startup-event.js"
import { discoverStorageStateDelay } from "../../src/discovery/storage-state.js"

test("confidence evaluation rejects insufficient evidence", async () => {
  let index = 0
  const result = await evaluateExperiment(() => {
    index += 1
    return Promise.resolve({
      status: index === 1 ? "failed" : "passed",
      durationMs: 1,
      exitCode: index === 1 ? 1 : 0,
      ...(index === 1 ? { failureSignature: "timeout" } : {}),
    })
  }, { concurrency: 1, faults: [], minimumFailureRate: 0.7, seed: 1, trials: 4 })

  expect(result.failureRate).toBe(0.25)
  expect(result.confirmed).toBe(false)
})

test("causal discovery can amplify an existing matching failure signature", async () => {
  let controlRuns = 0
  const result = await discoverNetworkDelay((trial) => {
    const treated = trial.faults.some((fault) => fault.kind === "network-delay")
    if (!treated) {
      controlRuns += 1
    }
    const failed = treated || controlRuns === 1
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "checkout-timeout" } : {}),
    })
  }, {
    concurrency: 1,
    maximumDelayMs: 2,
    minimumFailureRate: 0.7,
    pattern: "**/api/checkout",
    seed: 42,
    trials: 4,
  })

  expect(result.baseline.failureRate).toBe(0.25)
  expect(result.trigger.delayMs).toBe(1)
  expect(result.triggerResult).toMatchObject({
    confirmed: true,
    causalEffect: {
      controlFailures: 0,
      signature: "checkout-timeout",
      treatmentFailures: 12,
    },
  })
})

test("causal discovery interleaves paired controls and interventions", async () => {
  const trialIds: string[] = []
  await discoverAuthCookieExpiry((trial) => {
    trialIds.push(trial.trialId)
    const failed = trial.faults.some((fault) => fault.kind === "auth-cookie-expiry")
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "expired-session" } : {}),
    })
  }, {
    concurrency: 1,
    cookieName: "session-id",
    minimumFailureRate: 0.7,
    pattern: "**/api/session",
    seed: 42,
    trials: 4,
  })

  expect(trialIds.slice(0, 8)).toEqual([
    "batch-1-control-1",
    "batch-1-intervention-1",
    "batch-1-intervention-2",
    "batch-1-control-2",
    "batch-1-control-3",
    "batch-1-intervention-3",
    "batch-1-intervention-4",
    "batch-1-control-4",
  ])
})

test("causal discovery rejects a matching failure rate in the control", async () => {
  await expect(discoverNetworkDelay(() => Promise.resolve({
    status: "failed",
    durationMs: 1,
    exitCode: 1,
    failureSignature: "checkout-timeout",
  }), {
    concurrency: 1,
    maximumDelayMs: 2,
    minimumFailureRate: 0.7,
    pattern: "**/api/checkout",
    seed: 42,
    trials: 4,
  })).rejects.toThrow("Maximum network delay did not reproduce the failure confidently")
})

test("discovered reproducers retain the independent confirmation trial count", () => {
  const reproducer = buildDiscoveredReproducer(
    "tests/startup.spec.ts",
    42,
    0.7,
    {
      kind: "resource-loading-delay",
      delayMs: 429,
      pattern: "**/assets/*",
      resourceType: "script",
    },
    {
      confirmed: true,
      dominantFailureSignature: "startup-deadline",
      errors: 0,
      failed: 12,
      failureRate: 1,
      failureSignatures: [{
        failures: 12,
        failureRate: 1,
        lowerBound80: 0.88,
        signature: "startup-deadline",
        upperBound80: 1,
      }],
      lowerBound80: 0.88,
      passed: 0,
      representativeRuns: [],
      trials: 12,
      upperBound80: 1,
    },
  )

  expect(reproducer.trials).toBe(12)
  expect(reproducer.expectedFailure.signature).toBe("startup-deadline")
})

test("network delay discovery finds the smallest confirmed integer delay", async () => {
  const result = await discoverNetworkDelay((trial) => {
    const delay = trial.faults.find((fault) => fault.kind === "network-delay")
    const delayMs = delay?.kind === "network-delay" ? delay.delayMs : 0
    const failed = delayMs >= 100
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "checkout-timeout" } : {}),
    })
  }, {
    concurrency: 4,
    maximumDelayMs: 250,
    minimumFailureRate: 0.7,
    pattern: "**/api/checkout",
    seed: 42,
    trials: 4,
  })

  expect(result.trigger.delayMs).toBe(100)
  expect(result.triggerResult.confirmed).toBe(true)
  expect(result.triggerResult.trials).toBe(12)
})

test("network delay discovery rejects a boundary that does not confirm twice", async () => {
  const attempts = new Map<number, number>()
  const result = await discoverNetworkDelay((trial) => {
    const delay = trial.faults.find((fault) => fault.kind === "network-delay")
    const delayMs = delay?.kind === "network-delay" ? delay.delayMs : 0
    const attempt = attempts.get(delayMs) ?? 0
    attempts.set(delayMs, attempt + 1)
    const unstableBoundary = delayMs === 100 && attempt < 4
    const failed = delayMs > 100 || unstableBoundary
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "checkout-timeout" } : {}),
    })
  }, {
    concurrency: 1,
    maximumDelayMs: 250,
    minimumFailureRate: 0.7,
    pattern: "**/api/checkout",
    seed: 42,
    trials: 4,
  })

  expect(result.trigger.delayMs).toBe(101)
  expect(result.triggerResult.confirmed).toBe(true)
})

test("response truncation discovery finds the smallest confirmed byte removal", async () => {
  const result = await discoverResponseTruncation((trial) => {
    const truncation = trial.faults.find((fault) => fault.kind === "response-truncation")
    const removeBytes = truncation?.kind === "response-truncation"
      ? truncation.removeBytes
      : 0
    const failed = removeBytes >= 7
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "partial-json" } : {}),
    })
  }, {
    concurrency: 2,
    maximumRemoveBytes: 64,
    minimumFailureRate: 0.7,
    pattern: "**/api/checkout",
    seed: 42,
    trials: 4,
  })

  expect(result.trigger.removeBytes).toBe(7)
  expect(result.triggerResult.confirmed).toBe(true)
  expect(result.triggerResult.trials).toBe(12)
})

test("response duplication discovery finds the smallest confirmed byte count", async () => {
  const result = await discoverResponseDuplication((trial) => {
    const duplication = trial.faults.find((fault) => fault.kind === "response-duplication")
    const duplicateBytes = duplication?.kind === "response-duplication"
      ? duplication.duplicateBytes
      : 0
    const failed = duplicateBytes >= 7
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "duplicate-json" } : {}),
    })
  }, {
    concurrency: 2,
    maximumDuplicateBytes: 64,
    minimumFailureRate: 0.7,
    pattern: "**/api/checkout",
    seed: 42,
    trials: 4,
  })

  expect(result.trigger.duplicateBytes).toBe(7)
  expect(result.triggerResult.confirmed).toBe(true)
  expect(result.triggerResult.trials).toBe(12)
})

test("response reordering discovery finds the smallest confirmed hold", async () => {
  const result = await discoverResponseReordering((trial) => {
    const reordering = trial.faults.find((fault) => fault.kind === "response-reordering")
    const holdMs = reordering?.kind === "response-reordering" ? reordering.holdMs : 0
    const failed = holdMs >= 30
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "stale-response" } : {}),
    })
  }, {
    concurrency: 2,
    maximumHoldMs: 100,
    minimumFailureRate: 0.7,
    pattern: "**/api/search*",
    seed: 42,
    trials: 4,
  })

  expect(result.trigger.holdMs).toBe(30)
  expect(result.triggerResult.confirmed).toBe(true)
  expect(result.triggerResult.trials).toBe(12)
})

test("resource loading discovery finds the smallest script delay", async () => {
  const result = await discoverResourceLoadingDelay((trial) => {
    const resourceDelay = trial.faults.find((fault) => fault.kind === "resource-loading-delay")
    const delayMs = resourceDelay?.kind === "resource-loading-delay" ? resourceDelay.delayMs : 0
    const failed = delayMs >= 75
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "startup-deadline" } : {}),
    })
  }, {
    concurrency: 2,
    maximumDelayMs: 150,
    minimumFailureRate: 0.7,
    pattern: "**/assets/*",
    resourceType: "script",
    seed: 42,
    trials: 4,
  })

  expect(result.minimumDelayMs).toBe(75)
  expect(result.trigger).toMatchObject({ delayMs: 113, resourceType: "script" })
  expect(result.triggerResult.confirmed).toBe(true)
  expect(result.triggerResult.trials).toBe(12)
})

test("startup event discovery finds the edge and saves a stable trigger", async () => {
  const result = await discoverStartupEventDelay((trial) => {
    const startupDelay = trial.faults.find((fault) => fault.kind === "startup-event-delay")
    const delayMs = startupDelay?.kind === "startup-event-delay" ? startupDelay.delayMs : 0
    const failed = delayMs >= 75
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "hydration-deadline" } : {}),
    })
  }, {
    concurrency: 2,
    event: "dom-content-loaded",
    maximumDelayMs: 150,
    minimumFailureRate: 0.7,
    pattern: "**/hydration",
    seed: 42,
    trials: 4,
  })

  expect(result.minimumDelayMs).toBe(75)
  expect(result.trigger).toMatchObject({
    delayMs: 113,
    event: "dom-content-loaded",
  })
  expect(result.triggerResult.confirmed).toBe(true)
  expect(result.triggerResult.trials).toBe(12)
})

test("event-loop discovery minimizes duration and saves a stable stall", async () => {
  const result = await discoverEventLoopStall((trial) => {
    const stall = trial.faults.find((fault) => fault.kind === "event-loop-stall")
    const durationMs = stall?.kind === "event-loop-stall" ? stall.durationMs : 0
    const failed = durationMs >= 150
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "main-thread-deadline" } : {}),
    })
  }, {
    concurrency: 2,
    maximumDurationMs: 300,
    minimumFailureRate: 0.7,
    pattern: "**/event-loop",
    seed: 42,
    startAfterMs: 0,
    trials: 4,
  })

  expect(result.minimumDurationMs).toBe(150)
  expect(result.trigger).toMatchObject({ durationMs: 225, startAfterMs: 0 })
  expect(result.triggerResult.confirmed).toBe(true)
  expect(result.triggerResult.trials).toBe(12)
})

test("auth-cookie discovery confirms a value-free expired-session trigger", async () => {
  const result = await discoverAuthCookieExpiry((trial) => {
    const expired = trial.faults.some((fault) => fault.kind === "auth-cookie-expiry")
    return Promise.resolve({
      status: expired ? "failed" : "passed",
      durationMs: 1,
      exitCode: expired ? 1 : 0,
      ...(expired ? { failureSignature: "expired-session" } : {}),
    })
  }, {
    concurrency: 2,
    cookieName: "session-id",
    minimumFailureRate: 0.7,
    pattern: "**/api/session",
    seed: 42,
    trials: 4,
  })

  expect(result.trigger).toEqual({
    kind: "auth-cookie-expiry",
    cookieName: "session-id",
    pattern: "**/api/session",
  })
  expect(result.triggerResult.confirmed).toBe(true)
  expect(result.triggerResult.trials).toBe(12)
})

test("storage-state discovery finds the visibility boundary and saves a stable trigger", async () => {
  const result = await discoverStorageStateDelay((trial) => {
    const delay = trial.faults.find((fault) => fault.kind === "storage-state-delay")
    const delayMs = delay?.kind === "storage-state-delay" ? delay.delayMs : 0
    const failed = delayMs >= 100
    return Promise.resolve({
      status: failed ? "failed" : "passed",
      durationMs: 1,
      exitCode: failed ? 1 : 0,
      ...(failed ? { failureSignature: "storage-not-ready" } : {}),
    })
  }, {
    concurrency: 2,
    key: "auth-token",
    maximumDelayMs: 250,
    minimumFailureRate: 0.7,
    pattern: "**/app",
    seed: 42,
    storage: "local-storage",
    trials: 4,
  })

  expect(result.minimumDelayMs).toBe(100)
  expect(result.trigger).toMatchObject({
    delayMs: 175,
    key: "auth-token",
    storage: "local-storage",
  })
  expect(result.triggerResult.confirmed).toBe(true)
  expect(result.triggerResult.trials).toBe(12)
})

test("combination minimization removes irrelevant conditions", async () => {
  const minimal = await minimizeItems(["delay", "locale", "viewport"], (candidate) =>
    Promise.resolve(candidate.includes("delay")))

  expect(minimal).toEqual(["delay"])
})
