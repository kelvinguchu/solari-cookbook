import { expect, test } from "@playwright/test"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"

import { portableProjectPath } from "../../src/artifacts/paths.js"
import { retainOwnedArtifacts } from "../../src/artifacts/retention.js"

test("project paths are portable and outside paths do not expose their parent", ({
  browserName: _browserName,
}, testInfo) => {
  const projectRoot = testInfo.outputPath("project")
  const inside = resolve(projectRoot, "artifacts", "run", "trace.zip")
  const outside = resolve(projectRoot, "..", "private", "secret.txt")

  expect(portableProjectPath(projectRoot, inside)).toBe("artifacts/run/trace.zip")
  expect(portableProjectPath(projectRoot, outside)).toBe(`<outside-project>/${basename(outside)}`)
  expect(portableProjectPath(projectRoot, outside)).not.toContain("private")
})

test("bookkeeping-only Playwright output is removed", async ({
  browserName: _browserName,
}, testInfo) => {
  const projectRoot = testInfo.outputPath("project")
  const parent = resolve(projectRoot, ".flakelab", "runs", "playwright")
  const outputDirectory = resolve(parent, "clean-run")
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(resolve(outputDirectory, ".last-run.json"), "{}", "utf8")

  expect(await retainOwnedArtifacts(projectRoot, outputDirectory)).toBeNull()
  expect(await readdir(parent)).toEqual([])
})

test("retention keeps five marked evidence runs and never removes unmarked directories", async (
  { browserName: _browserName },
  testInfo,
) => {
  const projectRoot = testInfo.outputPath("project")
  const parent = resolve(projectRoot, ".flakelab", "runs", "playwright")
  const userDirectory = resolve(parent, "user-owned")
  await mkdir(userDirectory, { recursive: true })
  await writeFile(resolve(userDirectory, "notes.txt"), "keep", "utf8")
  await writeFile(resolve(userDirectory, ".flakelab-owned"), "user file", "utf8")

  for (let index = 0; index < 7; index += 1) {
    const outputDirectory = resolve(parent, `run-${index}`)
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(resolve(outputDirectory, "trace.zip"), `trace-${index}`, "utf8")
    const retained = await retainOwnedArtifacts(projectRoot, outputDirectory)
    expect(retained).toBe(`.flakelab/runs/playwright/run-${index}`)
  }

  const retainedDirectories = (await readdir(parent)).sort((left, right) => left.localeCompare(right))
  expect(retainedDirectories).toContain("user-owned")
  expect(retainedDirectories.filter((name) => name.startsWith("run-"))).toHaveLength(5)
  expect(await readdir(resolve(parent, "run-6"))).toContain("trace.zip")
  expect((await readdir(userDirectory)).sort((left, right) => left.localeCompare(right))).toEqual([
    ".flakelab-owned",
    "notes.txt",
  ])
})
