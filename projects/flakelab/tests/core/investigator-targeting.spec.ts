import { expect, test } from "@playwright/test"

import { conditionToFaults } from "../../src/investigator/targeting.js"

const requestPattern = "**/api/checkout"
const testPath = "tests/fixtures/flaky-checkout.spec.ts"

test("investigator routes page faults to documents instead of the API glob", () => {
  expect(conditionToFaults({
    durationMs: 500,
    kind: "event-loop-stall",
    startAfterMs: 0,
  }, requestPattern, testPath)).toMatchObject([{ pattern: "**" }])
  expect(conditionToFaults({
    delayMs: 100,
    kind: "resource-loading-delay",
    resourceType: "script",
  }, requestPattern, testPath)).toMatchObject([{ pattern: "**" }])
  expect(conditionToFaults({
    height: 667,
    kind: "viewport",
    width: 375,
  }, requestPattern, testPath)).toMatchObject([{ pattern: "**" }])
})

test("investigator preserves API and runner targeting", () => {
  expect(conditionToFaults({
    delayMs: 100,
    kind: "network-delay",
  }, requestPattern, testPath)).toMatchObject([{ pattern: requestPattern }])
  expect(conditionToFaults({
    kind: "worker-pressure",
    workers: 4,
  }, requestPattern, testPath)).toMatchObject([{ pattern: testPath }])
  expect(conditionToFaults({ kind: "baseline" }, requestPattern, testPath)).toEqual([])
})
