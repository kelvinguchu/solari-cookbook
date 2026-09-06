import { expect, test } from "@playwright/test"

import { runRequestSchema } from "../../src/domain/schema.js"

const validRequest = {
  selector: "tests/checkout.spec.ts",
  runs: 4,
  seed: 42,
  artifactDirectory: ".flakelab/runs",
  faults: [{
    kind: "network-delay" as const,
    pattern: "**/api/checkout",
    delayMs: 250,
  }],
}

test("run schema accepts a bounded deterministic diagnosis", () => {
  expect(runRequestSchema.parse(validRequest)).toEqual(validRequest)
})

test("run schema rejects unsafe experiment bounds", () => {
  expect(runRequestSchema.safeParse({ ...validRequest, runs: 101 }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...validRequest,
    faults: [{ ...validRequest.faults[0], delayMs: 30_001 }],
  }).success).toBe(false)
})

test("run schema accepts bounded HTTP failure injection", () => {
  const request = {
    ...validRequest,
    faults: [{
      kind: "request-failure" as const,
      pattern: "**/api/checkout",
      statusCode: 503,
    }],
  }

  expect(runRequestSchema.parse(request)).toEqual(request)
  expect(runRequestSchema.safeParse({
    ...request,
    faults: [{ ...request.faults[0], statusCode: 200 }],
  }).success).toBe(false)
})

test("run schema accepts value-free authentication and storage faults", () => {
  const request = {
    ...validRequest,
    faults: [
      {
        kind: "auth-cookie-expiry" as const,
        pattern: "**/api/session",
        cookieName: "session-id",
      },
      {
        kind: "storage-state-delay" as const,
        pattern: "**/app",
        storage: "session-storage" as const,
        key: "auth-state",
        delayMs: 250,
      },
    ],
  }

  expect(runRequestSchema.parse(request)).toEqual(request)
  expect(runRequestSchema.safeParse({
    ...request,
    faults: [{ ...request.faults[0], cookieName: "invalid cookie" }],
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...request,
    faults: [{ ...request.faults[1], storage: "cookie" }],
  }).success).toBe(false)
})

test("run schema accepts bounded clock, locale, and timezone faults", () => {
  const faults = [
    {
      kind: "clock-jump" as const,
      pattern: "**/app",
      jumpAfterMs: 25,
      offsetMs: -3_600_000,
    },
    { kind: "locale" as const, pattern: "**/app", locale: "fr-FR" },
    { kind: "timezone" as const, pattern: "**/app", timezoneId: "America/New_York" },
  ]
  expect(runRequestSchema.parse({ ...validRequest, faults }).faults).toEqual(faults)
  expect(runRequestSchema.safeParse({
    ...validRequest,
    faults: [{ ...faults[0], offsetMs: 0 }],
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...validRequest,
    faults: [{ ...faults[1], locale: "not_a_locale" }],
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...validRequest,
    faults: [{ ...faults[2], timezoneId: "Mars/Olympus" }],
  }).success).toBe(false)
})

test("run schema accepts bounded visual-environment faults", () => {
  const faults = [
    { kind: "animation-speed" as const, pattern: "**/app", rate: 5 },
    { kind: "reduced-motion" as const, pattern: "**/app" },
    { kind: "viewport" as const, pattern: "**/app", width: 375, height: 667 },
  ]
  expect(runRequestSchema.parse({ ...validRequest, faults }).faults).toEqual(faults)
  expect(runRequestSchema.safeParse({
    ...validRequest,
    faults: [{ ...faults[0], rate: 10.1 }],
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...validRequest,
    faults: [{ ...faults[2], width: 199 }],
  }).success).toBe(false)
})

test("run schema accepts one bounded runner-level fault", () => {
  const workers = { kind: "worker-pressure" as const, pattern: "tests/app.spec.ts", workers: 4 }
  const shared = {
    copies: 3,
    kind: "shared-state-interference" as const,
    pattern: "tests/app.spec.ts",
  }
  expect(runRequestSchema.parse({ ...validRequest, faults: [workers] }).faults).toEqual([workers])
  expect(runRequestSchema.parse({ ...validRequest, faults: [shared] }).faults).toEqual([shared])
  expect(runRequestSchema.safeParse({
    ...validRequest,
    faults: [{ ...workers, workers: 17 }],
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...validRequest,
    faults: [workers, shared],
  }).success).toBe(false)
})

test("run schema accepts bounded composable response faults", () => {
  const request = {
    ...validRequest,
    faults: [
      {
        kind: "event-loop-stall" as const,
        pattern: "**/checkout",
        startAfterMs: 0,
        durationMs: 100,
      },
      validRequest.faults[0],
      {
        kind: "response-duplication" as const,
        pattern: "**/api/checkout",
        duplicateBytes: 4,
      },
      {
        kind: "response-reordering" as const,
        pattern: "**/api/checkout",
        holdMs: 25,
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
  }

  expect(runRequestSchema.parse(request)).toEqual(request)
  expect(runRequestSchema.safeParse({
    ...request,
    faults: request.faults.map((fault) => (
      fault.kind === "response-truncation" ? { ...fault, removeBytes: 1_048_577 } : fault
    )),
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...request,
    faults: request.faults.map((fault) => (
      fault.kind === "response-duplication" ? { ...fault, duplicateBytes: 1_048_577 } : fault
    )),
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...request,
    faults: request.faults.map((fault) => (
      fault.kind === "response-reordering" ? { ...fault, holdMs: 30_001 } : fault
    )),
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...request,
    faults: request.faults.map((fault) => (
      fault.kind === "resource-loading-delay" ? { ...fault, resourceType: "fetch" } : fault
    )),
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...request,
    faults: request.faults.map((fault) => (
      fault.kind === "startup-event-delay" ? { ...fault, event: "ready" } : fault
    )),
  }).success).toBe(false)
  expect(runRequestSchema.safeParse({
    ...request,
    faults: request.faults.map((fault) => (
      fault.kind === "event-loop-stall" ? { ...fault, durationMs: 2_001 } : fault
    )),
  }).success).toBe(false)
})
