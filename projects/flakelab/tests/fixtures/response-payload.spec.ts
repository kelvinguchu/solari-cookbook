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

test("checkout API returns a complete JSON payload", async ({ page }) => {
  await page.goto(checkout.url)
  const payload = await page.evaluate(async (): Promise<string> => {
    const response = await fetch("/api/checkout", { method: "POST" })
    return response.text()
  })
  expect(payload).toBe('{"ok":true}')
})
