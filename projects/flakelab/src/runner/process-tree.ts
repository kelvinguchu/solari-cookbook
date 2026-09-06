import { spawn, spawnSync } from "node:child_process"
import { resolve } from "node:path"

const MAX_DIAGNOSTIC_BYTES = 64 * 1024
const TASKKILL_PATH = resolve(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe")

export interface CapturedProcessResult {
  diagnostic: string
  exitCode: number | null
  spawnError?: string
}

function appendBounded(current: string, chunk: Buffer): string {
  return `${current}${chunk.toString("utf8")}`.slice(-MAX_DIAGNOSTIC_BYTES)
}

function terminateProcessTree(child: ReturnType<typeof spawn>): void {
  const processId = child.pid
  if (!processId) {
    return
  }
  if (process.platform === "win32") {
    const termination = spawnSync(
      TASKKILL_PATH,
      ["/pid", String(processId), "/t", "/f"],
      { shell: false, stdio: "ignore", windowsHide: true },
    )
    if (termination.error || termination.status !== 0) {
      child.kill()
    }
    return
  }
  try {
    process.kill(-processId, "SIGTERM")
  } catch {
    child.kill()
  }
}

export function waitForProcessTree(
  child: ReturnType<typeof spawn>,
  signal?: AbortSignal,
): Promise<CapturedProcessResult> {
  return new Promise((complete) => {
    let diagnostic = ""
    let settled = false
    const finish = (result: CapturedProcessResult): void => {
      if (settled) {
        return
      }
      settled = true
      signal?.removeEventListener("abort", abort)
      complete(result)
    }
    const abort = (): void => {
      terminateProcessTree(child)
    }
    if (signal?.aborted) {
      abort()
    } else {
      signal?.addEventListener("abort", abort, { once: true })
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      diagnostic = appendBounded(diagnostic, chunk)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      diagnostic = appendBounded(diagnostic, chunk)
    })
    child.on("error", (error) => {
      finish({ diagnostic, exitCode: null, spawnError: error.message })
    })
    child.on("close", (exitCode) => {
      finish({ diagnostic, exitCode })
    })
  })
}
