import { expect, test } from "@playwright/test"

import { snapshotCacheKey } from "../../src/solari/run-demo.js"

test("snapshot cache keys are stable and include every preparation input", () => {
  const input = {
    appDirectory: "/workspace/app",
    commit: "commit-a",
    fixture: "fixture-a",
    lockfile: "lockfile-a",
    port: 8000,
    runtime: "python3",
    startCommand: "python3 server.py",
    startShell: "sh",
    template: "base",
    timeoutMs: 300_000,
  }
  const key = snapshotCacheKey(input)

  expect(snapshotCacheKey({ ...input })).toBe(key)
  for (const changed of [
    { ...input, appDirectory: "/workspace/other" },
    { ...input, commit: "commit-b" },
    { ...input, fixture: "fixture-b" },
    { ...input, lockfile: "lockfile-b" },
    { ...input, port: 9000 },
    { ...input, runtime: "python3.13" },
    { ...input, startCommand: "python3 -u server.py" },
    { ...input, startShell: "bash" },
    { ...input, template: "large" },
    { ...input, timeoutMs: 600_000 },
  ]) {
    expect(snapshotCacheKey(changed)).not.toBe(key)
  }
})
