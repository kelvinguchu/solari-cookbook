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

test("application reads its initialized browser storage", async ({ page }) => {
  await page.goto(`${checkout.url}/storage-seed`)
  await page.evaluate(() => localStorage.setItem("auth-token", "ready"))
  await page.goto(`${checkout.url}/storage-auth`)
  await expect(page.getByRole("status")).toHaveText("Authenticated from storage")
})
