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

test("concurrent API responses preserve request order", async ({ page }) => {
  await page.goto(checkout.url)
  const order = await page.evaluate(async (): Promise<string[]> => {
    const completed: string[] = []
    const request = async (slot: string): Promise<void> => {
      await fetch(`/api/order?slot=${slot}`)
      completed.push(slot)
    }
    await Promise.all([request("first"), request("second")])
    return completed
  })
  expect(order).toEqual(["first", "second"])
})
