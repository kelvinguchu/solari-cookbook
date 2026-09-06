import { readFile, readdir, stat } from "node:fs/promises"
import type { Dirent } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"

const MAX_SOURCE_BYTES = 64 * 1_024
const MAX_CONTEXT_FILES = 8
const MAX_APPROVED_SOURCE_FILES = MAX_CONTEXT_FILES - 1
const MAX_DISCOVERY_TEST_FILES = 20
const ALLOWED_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"])
const SECRET_ASSIGNMENT = /(?:api[_-]?key|authorization|password|secret|token)\s*[:=]\s*["'][^"']{8,}/iu
const LOCAL_IMPORT = /\bfrom\s+["'](\.[^"']+)["']/gu
const TEST_FILE = /\.(?:spec|test)\.(?:js|jsx|mjs|ts|tsx)$/iu

export interface SafeSource {
  content: string
  path: string
}

function resolveSafeSource(projectRoot: string, selector: string): string {
  const sourcePath = resolve(projectRoot, selector)
  const pathFromRoot = relative(projectRoot, sourcePath)
  if (pathFromRoot.startsWith("..") || pathFromRoot.includes("node_modules")) {
    throw new Error("Test source must stay inside the project and outside dependencies")
  }
  if (!ALLOWED_EXTENSIONS.has(extname(sourcePath).toLowerCase())) {
    throw new Error("Only JavaScript or TypeScript test source can be inspected")
  }
  return sourcePath
}

function resolveSafeProjectPath(projectRoot: string, selector: string): string {
  const selectedPath = resolve(projectRoot, selector)
  const pathFromRoot = relative(projectRoot, selectedPath)
  if (pathFromRoot.startsWith("..") || pathFromRoot.includes("node_modules")) {
    throw new Error("Test selection must stay inside the project and outside dependencies")
  }
  return selectedPath
}

export async function readSafeTestSource(
  projectRoot: string,
  selector: string,
): Promise<SafeSource> {
  const sourcePath = resolveSafeSource(projectRoot, selector)
  const sourceStats = await stat(sourcePath)
  if (!sourceStats.isFile() || sourceStats.size > MAX_SOURCE_BYTES) {
    throw new Error("Test source must be a regular file no larger than 64 KiB")
  }
  const content = await readFile(sourcePath, "utf8")
  if (SECRET_ASSIGNMENT.test(content)) {
    throw new Error("Test source contains a possible credential and cannot be sent to a model")
  }
  return { content, path: relative(projectRoot, sourcePath) }
}

async function existingSourcePath(importer: string, specifier: string): Promise<string | undefined> {
  const requested = resolve(dirname(importer), specifier)
  const extension = extname(requested)
  const base = extension ? requested.slice(0, -extension.length) : requested
  const candidates = extension === ".js"
    ? [`${base}.ts`, `${base}.tsx`, requested]
    : [requested, `${requested}.ts`, `${requested}.tsx`, resolve(requested, "index.ts")]
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) {
        return candidate
      }
    } catch {
      // Missing candidates are expected while resolving TypeScript's emitted .js imports.
    }
  }
  return undefined
}

function localImports(content: string): string[] {
  return [...content.matchAll(LOCAL_IMPORT)].map((match) => match[1])
}

async function readSafeContext(
  projectRoot: string,
  selectors: string[],
): Promise<SafeSource[]> {
  const queue = selectors.map((selector) => resolveSafeSource(projectRoot, selector))
  const visited = new Set<string>()
  const context: SafeSource[] = []
  while (queue.length > 0 && context.length < MAX_CONTEXT_FILES) {
    const sourcePath = queue.shift()
    if (!sourcePath || visited.has(sourcePath)) {
      continue
    }
    visited.add(sourcePath)
    const source = await readSafeTestSource(projectRoot, sourcePath)
    context.push(source)
    for (const specifier of localImports(source.content)) {
      const dependency = await existingSourcePath(sourcePath, specifier)
      if (dependency && !visited.has(dependency)) {
        queue.push(dependency)
      }
    }
  }
  const totalBytes = context.reduce((total, source) => total + Buffer.byteLength(source.content), 0)
  if (totalBytes > MAX_SOURCE_BYTES) {
    throw new Error("Local test context exceeds the 64 KiB model boundary")
  }
  return context
}

export function readSafeTestContext(projectRoot: string, selector: string): Promise<SafeSource[]> {
  return readSafeContext(projectRoot, [selector])
}

export function readSafeRepairContext(
  projectRoot: string,
  selectedTest: string,
  approvedSourcePaths: string[],
): Promise<SafeSource[]> {
  if (approvedSourcePaths.length > MAX_APPROVED_SOURCE_FILES) {
    throw new Error(
      `Repair accepts at most ${MAX_APPROVED_SOURCE_FILES} explicitly approved source files`,
    )
  }
  return readSafeContext(projectRoot, [selectedTest, ...approvedSourcePaths])
}

interface DirectoryContents {
  directories: string[]
  tests: string[]
}

function classifyDirectoryEntries(directory: string, entries: Dirent[]): DirectoryContents {
  const contents: DirectoryContents = { directories: [], tests: [] }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue
    }
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      contents.directories.push(path)
    } else if (entry.isFile() && TEST_FILE.test(entry.name)) {
      contents.tests.push(path)
    }
  }
  return contents
}

async function directoryContents(directory: string): Promise<DirectoryContents> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name))
  return classifyDirectoryEntries(directory, entries)
}

async function testFilesUnder(directory: string): Promise<string[]> {
  const pending = [directory]
  const tests: string[] = []
  while (pending.length > 0 && tests.length < MAX_DISCOVERY_TEST_FILES) {
    const current = pending.shift()!
    const contents = await directoryContents(current)
    const available = MAX_DISCOVERY_TEST_FILES - tests.length
    pending.push(...contents.directories)
    tests.push(...contents.tests.slice(0, available))
  }
  return tests
}

async function selectedTestFiles(projectRoot: string, selector: string): Promise<string[]> {
  const selectedPath = resolveSafeProjectPath(projectRoot, selector)
  const details = await stat(selectedPath)
  if (details.isFile()) {
    return [resolveSafeSource(projectRoot, selectedPath)]
  }
  if (details.isDirectory()) {
    return testFilesUnder(selectedPath)
  }
  return []
}

export async function discoverRepairSourceCandidates(
  projectRoot: string,
  selector: string,
): Promise<string[]> {
  const tests = await selectedTestFiles(projectRoot, selector)
  const selectedTests = new Set(tests.map((path) => relative(projectRoot, path)))
  const candidates = new Set<string>()
  for (const testPath of tests) {
    const context = await readSafeContext(projectRoot, [testPath])
    for (const source of context) {
      if (!selectedTests.has(source.path) && !TEST_FILE.test(source.path)) {
        candidates.add(source.path.replaceAll("\\", "/"))
      }
    }
  }
  return [...candidates].sort((left, right) => left.localeCompare(right))
}
