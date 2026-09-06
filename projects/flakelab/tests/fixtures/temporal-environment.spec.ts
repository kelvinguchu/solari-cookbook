import { expect, test } from "@playwright/test"

import type { CheckoutServer } from "../support/checkout-server.js"
import { startCheckoutServer } from "../support/checkout-server.js"

let checkout: CheckoutServer
const defaultLocale = "en-US"
const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

test.beforeAll(async () => {
  checkout = await startCheckoutServer()
})

test.afterAll(async () => {
  await checkout.close()
})

test.beforeEach(async ({ page }) => {
  await page.goto(`${checkout.url}/temporal`)
})

test("wall clock remains monotonic during startup", async ({ page }) => {
  await expect(page.getByTestId("clock")).toHaveText("Clock stable")
})

test("application uses its configured locale", async ({ page }) => {
  await expect(page.getByTestId("locale")).toHaveText(defaultLocale)
})

test("application uses its configured timezone", async ({ page }) => {
  await expect(page.getByTestId("timezone")).toHaveText(defaultTimezone)
})
