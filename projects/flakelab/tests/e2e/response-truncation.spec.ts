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

test("response truncation is exact and fully removed", async ({ page }) => {
  await page.goto(checkout.url)
  const removeFaults = await installFaults(page, [{
    kind: "response-truncation",
    pattern: "**/api/checkout",
    removeBytes: 1,
  }])

  const truncated = await page.evaluate(async (): Promise<string> => {
    const response = await fetch("/api/checkout", { method: "POST" })
    return response.text()
  })
  expect(truncated).toBe('{"ok":true')

  await removeFaults()
  const restored = await page.evaluate(async (): Promise<string> => {
    const response = await fetch("/api/checkout", { method: "POST" })
    return response.text()
  })
  expect(restored).toBe('{"ok":true}')
})
