import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import type { Dirent } from "node:fs"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"

import { portableProjectPath } from "./paths.js"

const OWNERSHIP_MARKER = ".flakelab-owned"
const OWNERSHIP_MARKER_CONTENT = "FlakeLab-owned artifacts\n"
const PLAYWRIGHT_BOOKKEEPING = new Set([OWNERSHIP_MARKER, ".last-run.json"])
const RETAINED_RUN_LIMIT = 5

interface OwnedRun {
  directory: string
  modifiedAt: number
}

async function hasUsefulEvidence(directory: string): Promise<boolean> {
  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (entry.isFile() && !PLAYWRIGHT_BOOKKEEPING.has(entry.name)) {
      return true
    }
    if (entry.isDirectory() && await hasUsefulEvidence(resolve(directory, entry.name))) {
      return true
    }
  }
  return false
}

function assertDirectChild(parent: string, directory: string): void {
  const child = relative(resolve(parent), resolve(directory))
  if (!child || child.includes(sep) || child.startsWith("..") || isAbsolute(child)) {
    throw new Error("Refusing to remove a Playwright artifact path outside its owned parent")
  }
}

async function removeRun(parent: string, directory: string): Promise<void> {
  assertDirectChild(parent, directory)
  await rm(directory, { force: true, recursive: true })
}

async function markOwned(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, OWNERSHIP_MARKER), OWNERSHIP_MARKER_CONTENT, "utf8")
}

async function ownedRuns(parent: string): Promise<OwnedRun[]> {
  const entries = await readdir(parent, { withFileTypes: true })
  const runs: OwnedRun[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const directory = resolve(parent, entry.name)
    try {
      const markerPath = resolve(directory, OWNERSHIP_MARKER)
      if (await readFile(markerPath, "utf8") !== OWNERSHIP_MARKER_CONTENT) {
        continue
      }
      const marker = await stat(markerPath)
      runs.push({ directory, modifiedAt: marker.mtimeMs })
    } catch {
      // Unmarked directories are user-owned and never eligible for retention cleanup.
    }
  }
  return runs
}

async function pruneOwnedRuns(parent: string, currentDirectory: string): Promise<void> {
  const current = resolve(currentDirectory)
  const runs = (await ownedRuns(parent)).filter((run) => run.directory !== current)
  runs.sort((left, right) => (
    right.modifiedAt - left.modifiedAt || right.directory.localeCompare(left.directory)
  ))
  for (const run of runs.slice(RETAINED_RUN_LIMIT - 1)) {
    await removeRun(parent, run.directory)
  }
}

export async function retainOwnedArtifacts(
  projectRoot: string,
  outputDirectory: string,
): Promise<string | null> {
  const parent = dirname(outputDirectory)
  if (!await hasUsefulEvidence(outputDirectory)) {
    await removeRun(parent, outputDirectory)
    return null
  }
  await markOwned(outputDirectory)
  await pruneOwnedRuns(parent, outputDirectory)
  return portableProjectPath(projectRoot, outputDirectory)
}
