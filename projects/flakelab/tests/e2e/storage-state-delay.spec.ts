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

test("storage delay hides a key without deleting its value", async ({ page }) => {
  await page.goto(`${checkout.url}/storage-seed`)
  await page.evaluate(() => localStorage.setItem("auth-token", "ready"))
  const removeFaults = await installFaults(page, [{
    kind: "storage-state-delay",
    pattern: "**/storage-auth",
    storage: "local-storage",
    key: "auth-token",
    delayMs: 250,
  }])

  await page.goto(`${checkout.url}/storage-auth`)
  await expect(page.getByRole("status")).toHaveText("Storage unavailable")

  await removeFaults()
  await page.goto(`${checkout.url}/storage-auth`)
  await expect(page.getByRole("status")).toHaveText("Authenticated from storage")
})
