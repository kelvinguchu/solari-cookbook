import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"

import { readReproducer, writeReproducer } from "../../src/reproducer/file.js"

test("portable YAML reproducers round-trip through strict validation", async ({
  browserName: _browserName,
}, testInfo) => {
  const filePath = testInfo.outputPath("flakelab.repro.yaml")
  const reproducer = {
    test: "tests/checkout.spec.ts",
    seed: 42,
    trials: 4,
    faults: [
      {
        kind: "event-loop-stall" as const,
        pattern: "**/checkout",
        startAfterMs: 0,
        durationMs: 100,
      },
      { kind: "network-delay" as const, pattern: "**/api/checkout", delayMs: 100 },
      {
        kind: "response-duplication" as const,
        pattern: "**/api/checkout",
        duplicateBytes: 4,
      },
      {
        kind: "response-reordering" as const,
        pattern: "**/api/search*",
        holdMs: 30,
      },
      {
        kind: "resource-loading-delay" as const,
        pattern: "**/assets/*",
        resourceType: "script" as const,
        delayMs: 100,
      },
      {
        kind: "response-truncation" as const,
        pattern: "**/api/checkout",
        removeBytes: 8,
      },
      {
        kind: "startup-event-delay" as const,
        pattern: "**/checkout",
        event: "dom-content-loaded" as const,
        delayMs: 100,
      },
    ],
    expectedFailure: { minimumRate: 0.7, signature: "checkout-timeout" },
  }

  await writeReproducer(filePath, reproducer)

  expect(await readReproducer(filePath)).toEqual(reproducer)
})

test("portable reproducers retain authentication metadata without credential values", async ({
  browserName: _browserName,
}, testInfo) => {
  const filePath = testInfo.outputPath("auth.repro.yaml")
  const reproducer = {
    test: "tests/auth.spec.ts",
    seed: 42,
    trials: 12,
    faults: [
      {
        kind: "auth-cookie-expiry" as const,
        pattern: "**/api/session",
        cookieName: "session-id",
      },
      {
        kind: "storage-state-delay" as const,
        pattern: "**/app",
        storage: "local-storage" as const,
        key: "auth-token",
        delayMs: 250,
      },
      {
        kind: "clock-jump" as const,
        pattern: "**/app",
        jumpAfterMs: 25,
        offsetMs: 3_600_000,
      },
      { kind: "locale" as const, pattern: "**/app", locale: "fr-FR" },
      {
        kind: "timezone" as const,
        pattern: "**/app",
        timezoneId: "America/New_York",
      },
      { kind: "animation-speed" as const, pattern: "**/app", rate: 5 },
      { kind: "reduced-motion" as const, pattern: "**/app" },
      { kind: "viewport" as const, pattern: "**/app", width: 375, height: 667 },
    ],
    expectedFailure: { minimumRate: 0.7, signature: "expired-session" },
  }

  await writeReproducer(filePath, reproducer)

  expect(await readReproducer(filePath)).toEqual(reproducer)
  expect(await readFile(filePath, "utf8")).not.toContain("cookieValue")
})

test("portable reproducers retain runner-level interference controls", async ({
  browserName: _browserName,
}, testInfo) => {
  const filePath = testInfo.outputPath("runner.repro.yaml")
  const reproducer = {
    expectedFailure: { minimumRate: 0.7, signature: "shared-collision" },
    faults: [{
      copies: 2,
      kind: "shared-state-interference" as const,
      pattern: "tests/account.spec.ts",
    }],
    seed: 42,
    test: "tests/account.spec.ts",
    trials: 12,
  }

  await writeReproducer(filePath, reproducer)

  expect(await readReproducer(filePath)).toEqual(reproducer)
})
