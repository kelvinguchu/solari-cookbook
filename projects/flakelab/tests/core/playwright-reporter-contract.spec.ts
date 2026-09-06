import { expect, test } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { runNativePlaywrightScan } from "../../src/runner/native-scan.js"
import type { ScanTestResult } from "../../src/scan/schema.js"

const CONFIG = `export default {
  fullyParallel: true,
  projects: [{ name: "alpha" }, { name: "beta" }],
  testDir: "./tests with spaces",
  timeout: 100,
  workers: 1,
}
`

const SPEC = `import { test } from "@playwright/test"
import { writeFile } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"

test("passes", () => {})

test("expected failure", () => {
  test.fail()
  throw new Error("known expected defect")
})

test.skip("skipped", () => {})

test("times out with evidence", async ({}, testInfo) => {
  const attachments = [
    ["screenshot", "image/png", "failure.png"],
    ["video", "video/webm", "failure.webm"],
    ["trace", "application/zip", "trace.zip"],
  ]
  for (const [name, contentType, file] of attachments) {
    const path = testInfo.outputPath(file)
    await writeFile(path, name)
    await testInfo.attach(name, { contentType, path })
  }
  await delay(1_000)
})
`

function findTest(
  tests: ScanTestResult[],
  project: string,
  title: string,
): ScanTestResult {
  const result = tests.find((entry) => (
    entry.identity.project === project && entry.identity.titlePath.at(-1) === title
  ))
  if (!result) {
    throw new Error(`Missing ${project} / ${title} from Playwright report`)
  }
  return result
}

test("installed Playwright JSON reporter satisfies the scan contract", async ({
  browserName: _browserName,
}, testInfo) => {
  const projectRoot = testInfo.outputPath("reporter contract project with spaces")
  const testDirectory = resolve(projectRoot, "tests with spaces")
  await mkdir(testDirectory, { recursive: true })
  await writeFile(resolve(projectRoot, "playwright.config.mjs"), CONFIG, "utf8")
  await writeFile(resolve(testDirectory, "reporter contract.spec.mjs"), SPEC, "utf8")

  const result = await runNativePlaywrightScan(
    projectRoot,
    "tests with spaces/reporter contract.spec.mjs",
    { artifactDirectory: ".flakelab/contract-artifacts", runs: 2, workers: 1 },
  )

  expect(result.runnerErrors).toEqual([])
  expect(result.tests).toHaveLength(8)
  for (const project of ["alpha", "beta"]) {
    expect(findTest(result.tests, project, "passes")).toMatchObject({
      counts: { errors: 0, failed: 0, passed: 2, skipped: 0 },
      status: "no-failure-observed",
      trials: 2,
    })
    expect(findTest(result.tests, project, "expected failure")).toMatchObject({
      counts: { errors: 0, failed: 0, passed: 2, skipped: 0 },
      status: "no-failure-observed",
    })
    expect(findTest(result.tests, project, "skipped")).toMatchObject({
      counts: { errors: 0, failed: 0, passed: 0, skipped: 2 },
      status: "skipped",
    })
    const timedOut = findTest(result.tests, project, "times out with evidence")
    expect(timedOut).toMatchObject({
      counts: { errors: 0, failed: 2, passed: 0, skipped: 0 },
      status: "failed-every-run",
    })
    expect(timedOut.failureClusters[0].occurrences).toBe(2)
    expect(timedOut.failureClusters[0].representativeArtifacts.map((artifact) => artifact.name))
      .toEqual(["screenshot", "video", "trace"])
  }
  expect(result.playwrightOutputDirectory).toMatch(
    /^\.flakelab\/contract-artifacts\/playwright\//u,
  )
  expect(JSON.stringify(result)).not.toContain(projectRoot)
})
