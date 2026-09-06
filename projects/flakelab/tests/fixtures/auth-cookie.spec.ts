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

test("an active session cookie authenticates the request", async ({ context, page }) => {
  await context.addCookies([{ name: "session-id", value: "active", url: checkout.url }])
  await page.goto(`${checkout.url}/cookie-auth`)
  await expect(page.getByRole("status")).toHaveText("Authenticated by cookie")
})
