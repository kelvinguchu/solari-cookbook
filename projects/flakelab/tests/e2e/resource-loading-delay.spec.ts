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

test("script loading delay misses startup without delaying documents", async ({ page }) => {
  const removeFaults = await installFaults(page, [{
    kind: "resource-loading-delay",
    pattern: "**/assets/*",
    resourceType: "script",
    delayMs: 750,
  }])

  await page.goto(`${checkout.url}/startup`)
  await expect(page.getByRole("status")).toHaveText("Startup missed deadline")

  await removeFaults()
  await page.goto(`${checkout.url}/startup`)
  await expect(page.getByRole("status")).toHaveText("Ready")
})
