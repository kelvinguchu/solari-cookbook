import { expect, test } from "@playwright/test"

import type { CheckoutServer } from "../support/checkout-server.js"
import { startCheckoutServer } from "../support/checkout-server.js"

let checkout: CheckoutServer

test.beforeAll(async () => {
  checkout = await startCheckoutServer()
})

test.afterAll(async () => {
  await checkout.close()
})

test("application becomes interactive within its main-thread budget", async ({ page }) => {
  await page.goto(`${checkout.url}/event-loop`)
  await expect(page.getByRole("status")).toHaveText("Interactive")
})
