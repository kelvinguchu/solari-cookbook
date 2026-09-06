import { mkdir, open, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

const SIGNAL_WAIT_MS = 1_000

function trialKey(): string {
  const seed = process.env.FLAKELAB_TRIAL_SEED ?? "local"
  return /^\d+$/u.test(seed) ? seed : "local"
}

async function signalExists(path: string): Promise<boolean> {
  try {
    const handle = await open(path, "r")
    await handle.close()
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false
    }
    throw error
  }
}

async function waitForContender(signalPath: string): Promise<void> {
  const deadline = Date.now() + SIGNAL_WAIT_MS
  while (Date.now() < deadline) {
    if (await signalExists(signalPath)) {
      return
    }
    await delay(10)
  }
}

export async function useExclusiveSharedState(
  scope: string,
  active: boolean,
): Promise<"exclusive"> {
  if (!active) {
    return "exclusive"
  }
  const directory = join(process.cwd(), ".flakelab", "shared-state-fixture")
  const lockPath = join(directory, `${scope}-${trialKey()}.lock`)
  const signalPath = `${lockPath}.contended`
  await mkdir(directory, { recursive: true })
  let lock: Awaited<ReturnType<typeof open>>
  try {
    lock = await open(lockPath, "wx")
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
      throw error
    }
    await writeFile(signalPath, "contended\n", { encoding: "utf8" })
    throw new Error(
      `Shared ${scope} state was already claimed by another Playwright worker`,
      { cause: error },
    )
  }
  try {
    await waitForContender(signalPath)
  } finally {
    await lock.close()
    await Promise.all([
      rm(lockPath, { force: true }),
      rm(signalPath, { force: true }),
    ])
  }
  return "exclusive"
}
