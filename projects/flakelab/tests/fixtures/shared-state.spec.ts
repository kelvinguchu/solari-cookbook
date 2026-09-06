import { expect, test } from "@playwright/test"

import { useExclusiveSharedState } from "../support/shared-state.js"

test("checkout owns its shared account for the complete operation", async () => {
  const active = process.env.FLAKELAB_SHARED_STATE_ACTIVE === "1"
  const access = await useExclusiveSharedState("repeated-account", active)
  expect(access).toBe("exclusive")
})
