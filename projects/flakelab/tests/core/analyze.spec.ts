import { expect, test } from "@playwright/test"
import { spawn } from "node:child_process"
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"

import { analyzeBlobReports } from "../../src/analysis/blob-report.js"
import { rankAnalysisFindings } from "../../src/commands/analyze.js"
import { resolvePlaywrightCliPath } from "../../src/runner/playwright-executor.js"
import { waitForProcessTree } from "../../src/runner/process-tree.js"

const CONFIG = `export default {
  fullyParallel: false,
  projects: [{ name: "chromium" }],
  retries: 1,
  testDir: "./tests with spaces",
  workers: 1,
}
`

const FLAKY_SPEC = `import { test } from "@playwright/test"
import { writeFile } from "node:fs/promises"

test("checkout passes on retry", async ({}, testInfo) => {
  if (testInfo.retry === 0) {
    const path = testInfo.outputPath("failure.png")
    await writeFile(path, "checkout response arrived after hydration")
    await testInfo.attach("screenshot", { contentType: "image/png", path })
    throw new Error("checkout response arrived after hydration")
  }
})
`

const PASSING_SPEC = `import { test } from "@playwright/test"
test("profile loads", () => {})
`

async function runPlaywright(
  projectRoot: string,
  arguments_: string[],
  environment: NodeJS.ProcessEnv,
): Promise<number | null> {
  const child = spawn(
    process.execPath,
    [resolvePlaywrightCliPath(projectRoot), ...arguments_],
    {
      cwd: projectRoot,
      env: { ...process.env, ...environment },
      shell: false,
      windowsHide: true,
    },
  )
  return (await waitForProcessTree(child)).exitCode
}

async function createShard(
  projectRoot: string,
  shard: string,
  outputDirectory: string,
): Promise<string> {
  await mkdir(outputDirectory, { recursive: true })
  const exitCode = await runPlaywright(
    projectRoot,
    ["test", `--shard=${shard}`, "--reporter=blob", "--workers=1"],
    { PLAYWRIGHT_BLOB_OUTPUT_DIR: outputDirectory },
  )
  expect(exitCode).toBe(0)
  const archive = (await readdir(outputDirectory)).find((name) => name.endsWith(".zip"))
  if (!archive) {
    throw new Error(`Shard ${shard} did not produce a blob report`)
  }
  return resolve(outputDirectory, archive)
}

async function createShardedReport(projectRoot: string): Promise<string> {
  const tests = resolve(projectRoot, "tests with spaces")
  await mkdir(tests, { recursive: true })
  await Promise.all([
    writeFile(resolve(projectRoot, "playwright.config.mjs"), CONFIG, "utf8"),
    writeFile(resolve(tests, "checkout flaky.spec.mjs"), FLAKY_SPEC, "utf8"),
    writeFile(resolve(tests, "profile.spec.mjs"), PASSING_SPEC, "utf8"),
  ])
  const first = await createShard(projectRoot, "1/2", resolve(projectRoot, "first shard"))
  const second = await createShard(projectRoot, "2/2", resolve(projectRoot, "second shard"))
  const combined = resolve(projectRoot, "combined blob reports")
  await mkdir(combined, { recursive: true })
  await Promise.all([
    copyFile(first, resolve(combined, basename(first))),
    copyFile(second, resolve(combined, basename(second))),
  ])
  return combined
}

test("existing sharded blob reports are merged, ranked, and left untouched", async ({
  browserName: _browserName,
}, testInfo) => {
  const projectRoot = testInfo.outputPath("consumer project with spaces")
  const source = await createShardedReport(projectRoot)
  const sourceEntries = (await readdir(source)).sort((left, right) => left.localeCompare(right))

  const result = await analyzeBlobReports(projectRoot, source, {
    artifactDirectory: ".flakelab/runs",
  })

  expect(result.archiveCount).toBe(2)
  expect(result.sourceKind).toBe("blob-directory")
  expect(result.runnerErrors).toEqual([])
  expect(result.tests).toHaveLength(2)
  expect(await readdir(source)).toEqual(sourceEntries)
  const flaky = result.tests.find((entry) => entry.identity.titlePath.at(-1) === "checkout passes on retry")
  expect(flaky).toMatchObject({
    counts: { errors: 0, failed: 1, passed: 1, skipped: 0 },
    status: "mixed-outcomes",
  })
  expect(flaky?.failureClusters[0].representativeArtifacts).toHaveLength(1)
  expect(result.artifactDirectory).toMatch(/^\.flakelab\/runs\/playwright-analysis\/run-/u)
  const retained = resolve(projectRoot, result.artifactDirectory ?? "missing")
  const retainedEntries = (await readdir(retained)).sort((left, right) => left.localeCompare(right))
  expect(retainedEntries).toContain(".flakelab-owned")
  expect(retainedEntries).toContain("resources")
  expect(retainedEntries).not.toContain("report.jsonl")
  expect(retainedEntries.some((name) => name.endsWith(".zip"))).toBe(false)

  const ranked = rankAnalysisFindings(result.tests)
  expect(ranked).toHaveLength(1)
  expect(ranked[0]).toMatchObject({ rank: 1, status: "mixed-outcomes" })
  expect(ranked[0].diagnosticArtifacts).toBe(1)

  const known = rankAnalysisFindings(result.tests, result.tests)
  expect(known[0].novelFailureModes).toBe(0)
  const changedBaseline = result.tests.map((entry) => ({
    ...entry,
    failureClusters: entry.failureClusters.map((cluster) => ({
      ...cluster,
      signature: "0000000000000000",
    })),
  }))
  const novel = rankAnalysisFindings(result.tests, changedBaseline)
  expect(novel[0]).toMatchObject({ novelFailureModes: 1, rank: 1 })
  expect(novel[0].reasons[0]).toContain("absent from the baseline")
})

test("a single blob archive is accepted without mutating its parent", async ({
  browserName: _browserName,
}, testInfo) => {
  const projectRoot = testInfo.outputPath("single archive consumer")
  const sourceDirectory = await createShardedReport(projectRoot)
  const archiveName = (await readdir(sourceDirectory)).find((name) => name.endsWith(".zip"))
  if (!archiveName) {
    throw new Error("Test fixture did not create an archive")
  }
  const archive = resolve(sourceDirectory, archiveName)
  const parentEntries = (await readdir(sourceDirectory)).sort((left, right) => left.localeCompare(right))

  const result = await analyzeBlobReports(projectRoot, archive, {
    artifactDirectory: ".flakelab/single-analysis",
  })

  expect(result.archiveCount).toBe(1)
  expect(result.sourceKind).toBe("blob-archive")
  expect(await readdir(sourceDirectory)).toEqual(parentEntries)
})

test("malformed archives are rejected and owned work is cleaned", async ({
  browserName: _browserName,
}, testInfo) => {
  const projectRoot = testInfo.outputPath("malformed consumer")
  const archive = resolve(projectRoot, "broken.zip")
  await mkdir(projectRoot, { recursive: true })
  await writeFile(archive, Buffer.alloc(22, 1))

  await expect(analyzeBlobReports(projectRoot, archive, {
    artifactDirectory: ".flakelab/analysis",
  })).rejects.toThrow("complete ZIP archive")

  const workParent = resolve(projectRoot, ".flakelab", "analysis", "playwright-analysis")
  expect(await readdir(workParent)).toEqual([])
  expect(await readdir(projectRoot)).toContain("broken.zip")
})
