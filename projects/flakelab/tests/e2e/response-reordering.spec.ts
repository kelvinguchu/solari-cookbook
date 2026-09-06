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

test("response reordering exposes a request race and is fully removed", async ({ page }) => {
  await page.goto(checkout.url)
  const removeFaults = await installFaults(page, [{
    kind: "response-reordering",
    pattern: "**/api/order*",
    holdMs: 100,
  }])

  const reordered = await page.evaluate(async (): Promise<string[]> => {
    const completed: string[] = []
    const request = async (slot: string): Promise<void> => {
      await fetch(`/api/order?slot=${slot}`)
      completed.push(slot)
    }
    await Promise.all([request("first"), request("second")])
    return completed
  })
  expect(reordered).toEqual(["second", "first"])

  await removeFaults()
  const restored = await page.evaluate(async (): Promise<string[]> => {
    const completed: string[] = []
    const request = async (slot: string): Promise<void> => {
      await fetch(`/api/order?slot=${slot}`)
      completed.push(slot)
    }
    await Promise.all([request("first"), request("second")])
    return completed
  })
  expect(restored).toEqual(["first", "second"])
})
