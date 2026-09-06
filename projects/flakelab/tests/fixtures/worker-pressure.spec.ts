import { expect, test } from "@playwright/test"

import { useExclusiveSharedState } from "../support/shared-state.js"

const pressureActive = process.env.FLAKELAB_WORKER_PRESSURE_ACTIVE === "1"
test.describe.configure({ mode: pressureActive ? "parallel" : "serial" })

async function useWorkerScopedAccount(): Promise<void> {
  const access = await useExclusiveSharedState("worker-account", pressureActive)
  expect(access).toBe("exclusive")
}

test("first checkout worker uses the shared account", useWorkerScopedAccount)
test("second checkout worker uses the shared account", useWorkerScopedAccount)
