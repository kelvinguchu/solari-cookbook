import { spawn } from "node:child_process"
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path"

import { retainOwnedArtifacts } from "../artifacts/retention.js"
import { redactText } from "../report/redaction.js"
import { parseNativeScanReport } from "../runner/native-scan.js"
import {
  createPlaywrightEnvironment,
  resolvePlaywrightCliPath,
} from "../runner/playwright-executor.js"
import { waitForProcessTree } from "../runner/process-tree.js"
import type { ScanTestResult } from "../scan/schema.js"
import type { AnalysisSourceKind } from "./schema.js"
import { inspectZipArchive } from "./zip-archive.js"

const MAX_ARCHIVES = 100
const MAX_TOTAL_EXPANDED_BYTES = 1_024 * 1_024 * 1_024

export interface BlobReportAnalysisOptions {
  artifactDirectory: string
  playwrightCliPath?: string
  signal?: AbortSignal
}

export interface BlobReportAnalysisResult {
  archiveCount: number
  artifactDirectory: string | null
  runnerErrors: string[]
  sourceKind: AnalysisSourceKind
  tests: ScanTestResult[]
}

interface BlobReportInput {
  archives: string[]
  kind: AnalysisSourceKind
}

async function discoverInput(sourcePath: string): Promise<BlobReportInput> {
  const information = await lstat(sourcePath)
  if (information.isSymbolicLink()) {
    throw new Error("Blob report input cannot be a symbolic link")
  }
  if (information.isFile()) {
    if (extname(sourcePath).toLowerCase() !== ".zip") {
      throw new Error("Blob report file must use the .zip extension")
    }
    return { archives: [sourcePath], kind: "blob-archive" }
  }
  if (!information.isDirectory()) {
    throw new Error("Blob report input must be a ZIP archive or directory")
  }
  const entries = await readdir(sourcePath, { withFileTypes: true })
  const archiveEntries = entries.filter((entry) => extname(entry.name).toLowerCase() === ".zip")
  if (archiveEntries.some((entry) => entry.isSymbolicLink() || !entry.isFile())) {
    throw new Error("Blob report directory contains a non-regular ZIP entry")
  }
  const archives = archiveEntries
    .map((entry) => resolve(sourcePath, entry.name))
    .sort((left, right) => left.localeCompare(right))
  if (archives.length === 0) {
    throw new Error("Blob report directory does not contain any ZIP archives")
  }
  return { archives, kind: "blob-directory" }
}

async function validateArchives(archives: string[]): Promise<void> {
  if (archives.length > MAX_ARCHIVES) {
    throw new Error(`Blob report input exceeds the ${MAX_ARCHIVES}-archive safety limit`)
  }
  let expandedBytes = 0
  for (const archive of archives) {
    const summary = await inspectZipArchive(archive)
    expandedBytes += summary.expandedBytes
    if (expandedBytes > MAX_TOTAL_EXPANDED_BYTES) {
      throw new Error("Blob reports expand beyond the 1 GiB combined safety limit")
    }
  }
}

function mergeArguments(playwrightCliPath: string, inputDirectory: string): string[] {
  return [playwrightCliPath, "merge-reports", "--reporter=json", inputDirectory]
}

async function copyArchives(archives: string[], directory: string): Promise<void> {
  for (const [index, archive] of archives.entries()) {
    const destination = join(directory, `${String(index + 1).padStart(3, "0")}-${basename(archive)}`)
    await copyFile(archive, destination)
  }
}

function assertDirectChild(parent: string, directory: string): void {
  const child = relative(resolve(parent), resolve(directory))
  if (!child || child.startsWith("..") || isAbsolute(child) || child.includes("/") || child.includes("\\")) {
    throw new Error("Refusing to clean an analysis path outside its owned parent")
  }
}

async function removeWorkDirectory(parent: string, directory: string): Promise<void> {
  assertDirectChild(parent, directory)
  await rm(directory, { force: true, recursive: true })
}

function mergeFailure(diagnostic: string): Error {
  const safeDiagnostic = redactText(diagnostic).trim().slice(-2_000)
  return new Error(safeDiagnostic || "Playwright could not merge the blob reports")
}

async function removeConversionFiles(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile() || entry.isSymbolicLink())
  await Promise.all(files.map(async (entry) => rm(join(directory, entry.name), { force: true })))
}

export async function analyzeBlobReports(
  projectRoot: string,
  source: string,
  options: BlobReportAnalysisOptions,
): Promise<BlobReportAnalysisResult> {
  const sourcePath = resolve(projectRoot, source)
  const input = await discoverInput(sourcePath)
  const workParent = resolve(projectRoot, options.artifactDirectory, "playwright-analysis")
  await mkdir(workParent, { recursive: true })
  const workDirectory = await mkdtemp(join(workParent, "run-"))
  let cleanupComplete = false
  try {
    await copyArchives(input.archives, workDirectory)
    const archiveCopies = (await readdir(workDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".zip")
      .map((entry) => resolve(workDirectory, entry.name))
      .sort((left, right) => left.localeCompare(right))
    await validateArchives(archiveCopies)
    const reportPath = join(workDirectory, "flakelab-merged.json")
    const playwrightCliPath = options.playwrightCliPath ?? resolvePlaywrightCliPath(projectRoot)
    const child = spawn(
      process.execPath,
      mergeArguments(playwrightCliPath, workDirectory),
      {
        cwd: projectRoot,
        detached: process.platform !== "win32",
        env: {
          ...createPlaywrightEnvironment(),
          PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
        },
        shell: false,
        windowsHide: true,
      },
    )
    const execution = await waitForProcessTree(child, options.signal)
    if (options.signal?.aborted) {
      throw new Error("Playwright blob report analysis was interrupted")
    }
    if (execution.spawnError || execution.exitCode !== 0) {
      throw mergeFailure(execution.spawnError ?? execution.diagnostic)
    }
    let parsed: ReturnType<typeof parseNativeScanReport>
    try {
      parsed = parseNativeScanReport(await readFile(reportPath, "utf8"), projectRoot)
    } catch {
      throw new Error("Playwright produced a missing or malformed merged JSON report")
    }
    await removeConversionFiles(workDirectory)
    const artifactDirectory = await retainOwnedArtifacts(projectRoot, workDirectory)
    cleanupComplete = true
    return {
      archiveCount: input.archives.length,
      artifactDirectory,
      runnerErrors: parsed.runnerErrors,
      sourceKind: input.kind,
      tests: parsed.tests,
    }
  } finally {
    if (!cleanupComplete) {
      await removeWorkDirectory(workParent, workDirectory)
    }
  }
}
