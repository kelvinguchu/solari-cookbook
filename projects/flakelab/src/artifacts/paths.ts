import { basename, isAbsolute, relative, resolve, sep } from "node:path"

import type { ScanTestResult } from "../scan/schema.js"

function isOutsideRoot(relativePath: string): boolean {
  return relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
}

export function portableProjectPath(projectRoot: string, path: string): string {
  const absolutePath = resolve(projectRoot, path)
  const relativePath = relative(resolve(projectRoot), absolutePath)
  if (!relativePath) {
    return "."
  }
  if (isOutsideRoot(relativePath)) {
    return `<outside-project>/${basename(absolutePath)}`
  }
  return relativePath.replaceAll("\\", "/")
}

export function portableScanTestPaths(
  test: ScanTestResult,
  projectRoot: string,
): ScanTestResult {
  return {
    ...test,
    failureClusters: test.failureClusters.map((cluster) => ({
      ...cluster,
      representativeArtifacts: cluster.representativeArtifacts.map((artifact) => ({
        ...artifact,
        path: portableProjectPath(projectRoot, artifact.path),
      })),
    })),
    identity: {
      ...test.identity,
      file: portableProjectPath(projectRoot, test.identity.file),
    },
  }
}
