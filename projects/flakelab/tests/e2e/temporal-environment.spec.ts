import { expect, test } from "@playwright/test"

import { installFaults } from "../../src/faults/install.js"
import type { CheckoutServer } from "../support/checkout-server.js"
import { startCheckoutServer } from "../support/checkout-server.js"

let checkout: CheckoutServer

test.beforeAll(async () => {
  checkout = await startCheckoutServer()
})

test.afterAll(async () => {
  await checkout.close()
})

test("clock jump changes wall time without changing timer scheduling", async ({ page }) => {
  const remove = await installFaults(page, [{
    kind: "clock-jump",
    pattern: "**/temporal",
    jumpAfterMs: 25,
    offsetMs: 3_600_000,
  }])
  await page.goto(`${checkout.url}/temporal`)
  await expect(page.getByTestId("clock")).toHaveText("Clock jumped")
  await remove()
  await page.goto(`${checkout.url}/temporal`)
  await expect(page.getByTestId("clock")).toHaveText("Clock stable")
})

test("direct integration rejects context-only environment faults", async ({ page }) => {
  await expect(installFaults(page, [
    { kind: "locale", pattern: "**/temporal", locale: "fr-FR" },
    { kind: "timezone", pattern: "**/temporal", timezoneId: "America/New_York" },
  ])).rejects.toThrow("require FlakeLab project-level execution")
})
