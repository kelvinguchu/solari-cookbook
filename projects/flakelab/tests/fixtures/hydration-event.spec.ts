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

test("application hydrates when DOM content becomes ready", async ({ page }) => {
  await page.goto(`${checkout.url}/hydration`)
  await expect(page.getByRole("status")).toHaveText("Hydrated")
})
